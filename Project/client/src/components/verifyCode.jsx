import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function VerifyCode() {
    const [verificationCode, setVerificationCode] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const location = useLocation(); // Get the passed email from the previous page
    const navigate = useNavigate();

    const email = location.state.email; // Extract the email passed from the login page

    const handleVerifyCode = async (event) => {
        event.preventDefault();
        setErrorMessage('');

        try {
            const formBody = JSON.stringify({
                Email: email,
                verificationCode: verificationCode
            });

            const response = await fetch('http://localhost:8080/user/verify-2fa', {
                method: "POST",
                body: formBody,
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error('Invalid verification code');
            }

            // Navigate to the dashboard upon successful verification
            navigate('/dashboard');
        } catch (error) {
            setErrorMessage('Verification failed. Please try again.');
        }
    };

    return (
        <div style={styles.container}>
            <h2>Enter Verification Code</h2>
            <p>A code has been sent to your email: {email}</p>
            <form onSubmit={handleVerifyCode} style={styles.form}>
                <label htmlFor="verificationCode">Verification Code:</label>
                <input
                    type="text"
                    id="verificationCode"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    required
                    style={styles.input}
                />
                <button type="submit" style={styles.button}>Verify Code</button>
            </form>

            {errorMessage && <p style={{ color: 'red' }}>{errorMessage}</p>}
        </div>
    );
}

const styles = {
    container: {
        backgroundColor: 'white',
        padding: '40px',
        margin: '50px auto',
        borderRadius: '8px',
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
        width: '400px',
        textAlign: 'center',
    },
    form: {
        display: 'flex',
        flexDirection: 'column',
    },
    input: {
        padding: '10px',
        marginBottom: '10px',
        borderRadius: '4px',
        border: '1px solid #ccc',
        width: '100%',
    },
    button: {
        padding: '10px',
        fontSize: '16px',
        backgroundColor: '#00539C',
        color: 'white',
        borderRadius: '4px',
        cursor: 'pointer',
        width: '100%',
        border: 'none',
    },
};
