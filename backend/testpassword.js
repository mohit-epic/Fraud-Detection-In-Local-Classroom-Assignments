const bcrypt = require("bcrypt");

async function testPassword() {
    const storedHash = "$2b$10$H.4uH850b/3e9GSi.enuDufo.ThWEM5WWqDDwzPirOBO.I8tLxF5S"; // Replace with the hash from the database
    const passwordToTest = "manju"; // Replace with the password you're using to log in
    const isMatch = await bcrypt.compare(passwordToTest, storedHash);
    console.log("Password matches:", isMatch);
}

testPassword();