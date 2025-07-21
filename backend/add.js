const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const saltRounds = 10;
const students = [
    { username: "student1", email: "student1@example.com", password: "student1pass" },
    { username: "student2", email: "student2@example.com", password: "student2pass" },
    { username: "student3", email: "student3@example.com", password: "student3pass" },
    { username: "student4", email: "student4@example.com", password: "student4pass" },
    { username: "student5", email: "student5@example.com", password: "student5pass" },
];

async function addStudents() {
    try {
        // Connect to MongoDB
        await mongoose.connect("mongodb://localhost:27017/software_engineering_project", {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("Connected to MongoDB");

        // Insert each student
        for (const student of students) {
            const hashedPassword = await bcrypt.hash(student.password, saltRounds);
            await mongoose.connection.db.collection("students").insertOne({
                username: student.username,
                email: student.email,
                password: hashedPassword,
            });
            console.log(`Added student: ${student.username}`);
        }

        console.log("All students added successfully");
    } catch (error) {
        console.error("Error adding students:", error);
    } finally {
        // Close the connection
        await mongoose.connection.close();
        console.log("MongoDB connection closed");
    }
}

addStudents();