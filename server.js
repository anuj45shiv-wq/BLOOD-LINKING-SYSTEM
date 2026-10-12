// Local development entry point: npm start
require("dotenv").config();
const app = require("./app");

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`BloodLink running at http://localhost:${PORT}`);
});
