const express = require('express');
const app = express();

app.get('/', (req, res) => {
    res.send("Service Test");
})

app.listen(3443, () => {
    console.log("Listening on port 3443");
});