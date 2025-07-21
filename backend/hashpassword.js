const bcrypt = require("bcrypt");

async function hashPassword() {
    const password = "manju"; // Replace with your desired password
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log("Hashed Password:", hashedPassword);
}

hashPassword();