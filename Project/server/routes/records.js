import { Router } from "express";
import { connection } from "../database/database.js";
import { SendMail } from "../utils/SendMail.js";

const records = Router();

//fetch records entries from the database
records.get('/', async (req, res) => {
    const { email } = req.query;

    try {
        const query = email
            ? 'SELECT * FROM records WHERE studentEmail = ?'
            : 'SELECT * FROM records';
        const values = email ? [email] : [];

        const [rows] = await connection.execute(query, values);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching records:', error);
        res.status(500).json({ message: 'Failed to fetch records' });
    }
});

records.get('/student-info', async (req, res) => {
    const { email, advisingID } = req.query;

    try {
        console.log('/student-info route accessed with email:', email);
        console.log(' and advisingID:', advisingID);

        // Query userdata for First_Name and Last_Name
        const [userResults] = await connection.query('SELECT First_Name, Last_Name FROM userdata WHERE Email = ?', [email]);
        const user = userResults[0]; // Access the first result from userdata query

        // Query records for lastTerm lastGPA, currentTerm, status
        const [recordResults] = await connection.query('SELECT lastTerm, lastGPA, currentTerm, status FROM records WHERE studentEmail = ? AND advisingID = ?', [email, advisingID]);
        const record = recordResults[0]; // Access the first result from records query

        const [courseMappingResults] = await connection.query(
            'SELECT c.courseCode, c.courseName FROM coursemapping AS m INNER JOIN coursecatalog AS c ON m.course_ID = c.courseID WHERE m.advising_ID = ?',
            [advisingID]
        );
        const [prereqMappingResults] = await connection.query(
            'SELECT c.preCourseCode, c.preCourseName FROM prereqmapping AS m INNER JOIN prereqcatalog AS c ON m.course_ID = c.courseID WHERE m.advising_ID = ?',
            [advisingID]
        );
        // Log the results to check their structure
        console.log('User data:', user);
        console.log('Record data:', record);

        if (user && record) {
            res.json({
                firstName: user.First_Name,
                lastName: user.Last_Name,
                lastTerm: record.lastTerm,
                currentTerm: record.currentTerm,
                lastGPA: record.lastGPA,
                advisingID: record.advisingID,
                status: record.status,
                courses: courseMappingResults,
                prereqs: prereqMappingResults,
            });
        } else {
            res.status(404).json({ message: 'Student not found' });
        }
    } catch (error) {
        console.error('Error retrieving student information:', error);
        res.status(500).json({ message: 'Error retrieving student information' });
    }
});

//checks against courses schedules for other terms
records.get('/previous-courses', async (req, res) => {
    const { email } = req.query;

    if (!email) {
        return res.status(400).json({ message: 'Email is required' });
    }

    try {
        const query = `
            SELECT DISTINCT cc.courseCode, cc.courseName
            FROM records r
            JOIN coursemapping cm ON r.advisingID = cm.advising_ID
            JOIN coursecatalog cc ON cm.course_ID = cc.courseID
            WHERE r.studentEmail = ?
        `;

        // Execute the query with the provided email
        const [rows] = await connection.execute(query, [email]);

        // If no previously scheduled courses
        if (rows.length === 0) {
            return res.status(200).json({ message: 'No previously taken courses found.', courses: [] });
        }

        // Map results to a simpler format if needed
        const courses = rows.map(row => ({
            courseCode: row.courseCode,
            courseName: row.courseName,
        }));

        res.status(200).json(courses);
    } catch (error) {
        console.error('Error fetching previous courses:', error);
        res.status(500).json({ message: 'Failed to fetch previous courses' });
    }
});




//update record status and reject reason
records.post('/', async (req, res) => {
    const updatedEntries = req.body; // Expected to be an object with record IDs as keys

    try {
        // Loop through each entry in updatedEntries
        for (const [id, { status, rejectReason }] of Object.entries(updatedEntries)) {
            await connection.execute(
                'UPDATE records SET status = ?, rejectReason = ? WHERE id = ?',
                [status, rejectReason || null, id]
            );
        }

        res.status(200).json({ message: 'Entries updated successfully' });
    } catch (error) {
        console.error('Error updating records:', error);
        res.status(500).json({ message: 'Failed to update records' });
    }
});

records.post('/update-status', async (req, res) => {
    const { updates } = req.body;

    try {
        // Loop through each update to apply changes and send email
        for (const advisingID in updates) {
            const update = updates[advisingID];

            if (update.status === 'accepted' || update.status === 'rejected') {
                // Update the status in the database
                const newStatus = update.status === 'accepted' ? 'Accepted' : 'Rejected';
                await connection.execute(
                    'UPDATE records SET status = ? WHERE advisingID = ?',
                    [newStatus, advisingID]
                );

                // Retrieve student's email and current term from the records table
                const [recordResults] = await connection.execute(
                    'SELECT studentEmail, currentTerm FROM records WHERE advisingID = ?',
                    [advisingID]
                );
                const record = recordResults[0];

                if (record) {
                    const { studentEmail, currentTerm } = record;
                    const advisorComments = update.comments || 'No additional comments provided.';
                    let subject = 'Your Advising Plan Update';
                    let message;

                    if (update.status === 'accepted') {
                        // Accepted email message
                        message = `
                            <p>Congratulations,</p>
                            <p>Your Advising plan for the term <strong>${currentTerm}</strong> has been accepted!</p>
                            <p><strong>Advisor Comments:</strong> ${advisorComments}</p>
                        `;
                    } else if (update.status === 'rejected') {
                        // Rejected email message with reason
                        message = `
                            <p>We're sorry,</p>
                            <p>Your Advising plan for the term <strong>${currentTerm}</strong> has been rejected.</p>
                            <p><strong>Advisor Comments:</strong> ${advisorComments}</p>
                        `;
                    }

                    // Send the email
                    await SendMail(studentEmail, subject, message);
                }
            }
        }

        res.status(200).json({ message: 'Entries updated and emails sent successfully' });
    } catch (error) {
        console.error('Error updating entries:', error);
        res.status(500).json({ message: 'Failed to update entries' });
    }
});

//working /create-entry route
/* records.post('/create-entry', async (req, res) => {
    const { email, lastTerm, lastGPA, currentTerm, selectedItems1, selectedItems2 } = req.body;

    try {
        // Start a transaction to ensure atomicity
        await connection.beginTransaction();

        // Insert a single record into 'records' table
        const [result] = await connection.execute(
            'INSERT INTO records (studentEmail, lastTerm, lastGPA, currentTerm) VALUES (?, ?, ?, ?)',
            [email, lastTerm, lastGPA, currentTerm]
        );

        // Get the advisingID of the newly created record
        const advisingID = result.insertId;

        // Log selected items to check values (for debugging)
        // console.log("Selected Courses (selectedItems2):", selectedItems2);
        // console.log("Selected Prerequisites (selectedItems1):", selectedItems1);

        // Insert selected courses into 'coursemapping' table
        if (selectedItems2 && selectedItems2.length > 0) {
            const courseMappingValues = selectedItems2.map(courseID => [advisingID, courseID]);
            await connection.query(
                'INSERT INTO coursemapping (advising_ID, course_ID) VALUES ?',
                [courseMappingValues]
            );
        }

        // Insert selected prerequisites into 'prereqmapping' table
        if (selectedItems1 && selectedItems1.length > 0) {
            const prereqMappingValues = selectedItems1.map(courseID => [advisingID, courseID]);
            await connection.query(
                'INSERT INTO prereqmapping (advising_ID, course_ID) VALUES ?',
                [prereqMappingValues]
            );
        }

        // Commit the transaction
        await connection.commit();

        res.status(201).json({ message: 'Entry created successfully' });
    } catch (error) {
        // Roll back the transaction in case of error
        await connection.rollback();
        console.error('Error creating entry:', error);
        res.status(500).json({ message: 'Failed to create entry' });
    }
}); */

records.post('/create-entry', async (req, res) => {
    const { email, lastTerm, lastGPA, currentTerm, selectedItems1, selectedItems2 } = req.body;

    try {
        console.log('Received payload:', req.body); // Log received data
    } catch (error) {
        console.error('Error parsing request body:', error);
        res.status(400).json({ message: 'Invalid request payload' });
    }

    try {
        // Start a transaction to ensure atomicity
        await connection.beginTransaction();

        // Step 0: Check for existing `Pending` record with the same lastTerm and currentTerm
        const [existingPendingRecords] = await connection.execute(
            `
            SELECT advisingID 
            FROM records 
            WHERE studentEmail = ? AND lastTerm = ? AND currentTerm = ? AND status = 'Pending'
            `,
            [email, lastTerm, currentTerm]
        );

        if (existingPendingRecords.length > 0) {
            const existingAdvisingID = existingPendingRecords[0].advisingID;

            // Delete related entries from coursemapping and prereqmapping
            await connection.execute(
                'DELETE FROM coursemapping WHERE advising_ID = ?',
                [existingAdvisingID]
            );
            await connection.execute(
                'DELETE FROM prereqmapping WHERE advising_ID = ?',
                [existingAdvisingID]
            );

            // Delete the record from records table
            await connection.execute(
                'DELETE FROM records WHERE advisingID = ?',
                [existingAdvisingID]
            );

            console.log(`Deleted existing Pending record with advisingID ${existingAdvisingID}`);
        }

        // Step 1: Check for conflicting courses in other terms (coursecatalog)
        const placeholders = selectedItems2.map(() => '?').join(', ');
        const [conflictingCourses] = await connection.execute(
            `
            SELECT DISTINCT cc.courseName
            FROM records r
            JOIN coursemapping cm ON r.advisingID = cm.advising_ID
            JOIN coursecatalog cc ON cm.course_ID = cc.courseID
            WHERE r.studentEmail = ?
            AND r.currentTerm != ?
            AND cm.course_ID IN (${placeholders})
            `,
            [email, currentTerm, ...selectedItems2]
        );

        if (conflictingCourses.length > 0) {
            // Roll back the transaction since we are not proceeding with the entry
            await connection.rollback();

            // Extract course names of conflicting courses
            const conflictingCourseNames = conflictingCourses.map(row => row.courseName);
            return res.status(400).json({
                message: 'Cannot create entry. The following courses are already scheduled in other terms:',
                conflictingCourses: conflictingCourseNames,
            });
        }

        // Step 1.5: Check for conflicting prerequisites in other terms (prereqcatalog)
        const prereqPlaceholders = selectedItems1.map(() => '?').join(', ');
        const [conflictingPrereqs] = await connection.execute(
            `
            SELECT DISTINCT pc.preCourseName
            FROM records r
            JOIN prereqmapping pm ON r.advisingID = pm.advising_ID
            JOIN prereqcatalog pc ON pm.course_ID = pc.courseID
            WHERE r.studentEmail = ?
            AND r.currentTerm != ?
            AND pm.course_ID IN (${prereqPlaceholders})
            `,
            [email, currentTerm, ...selectedItems1]
        );

        if (conflictingPrereqs.length > 0) {
            await connection.rollback();

            const conflictingPrereqNames = conflictingPrereqs.map(row => row.preCourseName);
            return res.status(400).json({
                message: 'Cannot create entry. The following prerequisites are already scheduled in other terms:',
                conflictingPrereqs: conflictingPrereqNames,
            });
        }

        // Step 2: Insert a single record into 'records' table
        const [result] = await connection.execute(
            'INSERT INTO records (studentEmail, lastTerm, lastGPA, currentTerm) VALUES (?, ?, ?, ?)',
            [email, lastTerm, lastGPA, currentTerm]
        );

        // Step 3: Get the advisingID of the newly created record
        const advisingID = result.insertId;

        // Step 4: Insert selected courses into 'coursemapping' table
        if (selectedItems2 && selectedItems2.length > 0) {
            const courseMappingValues = selectedItems2.map(courseID => [advisingID, courseID]);
            const mappingPlaceholders = courseMappingValues.map(() => '(?, ?)').join(', ');
            const flattenedValues = courseMappingValues.flat();

            await connection.query(
                `INSERT INTO coursemapping (advising_ID, course_ID) VALUES ${mappingPlaceholders}`,
                flattenedValues
            );
        }

        // Step 5: Insert selected prerequisites into 'prereqmapping' table
        if (selectedItems1 && selectedItems1.length > 0) {
            const prereqMappingValues = selectedItems1.map(courseID => [advisingID, courseID]);
            const mappingPlaceholders = prereqMappingValues.map(() => '(?, ?)').join(', ');
            const flattenedValues = prereqMappingValues.flat();

            await connection.query(
                `INSERT INTO prereqmapping (advising_ID, course_ID) VALUES ${mappingPlaceholders}`,
                flattenedValues
            );
        }

        // Commit the transaction
        await connection.commit();

        res.status(201).json({ message: 'Entry created successfully' });
    } catch (error) {
        // Roll back the transaction in case of error
        await connection.rollback();
        console.error('Error creating entry:', error);
        res.status(500).json({ message: 'Failed to create entry' });
    }
});


export default records;