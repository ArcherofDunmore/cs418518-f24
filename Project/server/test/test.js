import { expect } from "chai";
/* import connection from "../database/database.js"; */
import supertest from "supertest";
import app from "../app.js";

describe("Login API Testing", () => {
    // Test 1: Check Login API - Invalid Password
    it("should return 401 for invalid password", async () => {
        const response = await supertest(app).post("/user/login").send({
            email: "great.gavin0@gmail.com",
            Password: "wrongpassword",
        });

        expect(response.status).to.equal(401);
        expect(response.body.message).to.include("Invalid password");
    });

    // Test 2: Check Login API - Non-existent User
    it("should return 404 for non-existent user", async () => {
        const response = await supertest(app).post("/user/login").send({
            email: "great.gavin99@gmail.com",
            Password: "password123",
        });

        expect(response.status).to.equal(404);
        expect(response.body.message).to.include("Invalid email");
    });
});

describe("Create Account API", () => {
    let testEmails = [];
    let testEmail = "newuser@example.com";

    // Test 3: Create Account API
    it("should return 201 for successful account creation", async () => {
        const response = await supertest(app).post("/user").send({
            firstName: "Test",
            lastName: "User",
            email: testEmail,
            password: "SecurePassword123!",
        });

        expect(response.status).to.equal(201);
        expect(response.body.message).to.include("Account created successfully");

        testEmails.push(testEmail);
    });

    let dupeEmail = "duplicate@example.com";

    // Test 4: Duplicate Email API
    it("should return 409 for duplicate email account creation", async () => {
        // First, create the account
        const createResponse = await supertest(app).post("/user").send({
            firstName: "Duplicate",
            lastName: "User",
            email: dupeEmail,
            password: "SecurePassword123!",
        });

        expect(createResponse.status).to.equal(201);
        expect(createResponse.body.message).to.include("Account created successfully");

        // Attempt to create the same account again
        const duplicateResponse = await supertest(app).post("/user").send({
            firstName: "Duplicate",
            lastName: "User",
            email: dupeEmail,
            password: "SecurePassword123!",
        });

        expect(duplicateResponse.status).to.equal(409); // Assuming your API returns 409 Conflict
        expect(duplicateResponse.body.message).to.include("Email already exists");

        testEmails.push(dupeEmail);
    });

    afterAll(async () => {
        try {
            console.log("Starting parallel cleanup...");
            const deletionPromises = testEmails.map(async (email) => {
                console.log(`Attempting to delete user: ${email}`);
                const response = await supertest(app).delete(`/user/${email}`);
                console.log(`Deleted user ${email}:`, response.status, response.body);
            });

            await Promise.all(deletionPromises);
            console.log("Parallel cleanup completed successfully.");
        } catch (error) {
            console.error("Error during cleanup:", error.message);
            throw error;
        }
    });
});

