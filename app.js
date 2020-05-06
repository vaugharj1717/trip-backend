const express = require('express');
const app = express();
const cors = require('cors');
const mysql = require('mysql');
const fs = require('fs');
const bcrypt = require('bcrypt');
const session = require('express-session');
const fetch = require('node-fetch');

app.use(cors());
app.use(express.json());
app.use(session({secret: "shhh", saveUninitialized: false, resave: true}));

const port = 3444;
const apikey = 'AIzaSyBmWLOxG5pppuLMUMnrr62pTsSzhTsxxl8';
const autocompleteHost = `https://maps.googleapis.com/maps/api/place/autocomplete/json?key=${apikey}&types=(cities)&components=country:us`;

let credentials = JSON.parse(fs.readFileSync('credentials.json', 'utf-8'));
let connection = mysql.createConnection(credentials);
connection.connect();

app.use(function(req, res, next) {
    if (req.session && req.session.user) {
        req.userid = req.session.userid;
    }
    next();
});

app.post('/register', (req, res) => {
    const username = req.body.username;
    const email = req.body.email;
    bcrypt.hash(req.body.password, 10, (err, password) => {
        const query = 'INSERT INTO user(username, password, email) VALUES (?, ?, ?)';
        const params = [username, password, email];
        connection.query(query, params, (err, result) => {
            if(!err){
                res.send({ok: true, id: result.insertId});
            }
            else {
                res.send({ok: false});
            }
        });
    });
});

app.post('/login', async (req, res) => {
    const username = req.body.username;
    const query = "SELECT id, username, password FROM user u WHERE username = ?";
    const params = [username];
    connection.query(query, params, (err, rows) => {
        if(!err){
            if(rows.length > 0){
                bcrypt.compare(req.body.password, rows[0].password, (err, correct) => {
                    if(correct){
                        const query = 'SELECT id, name FROM trip WHERE userid = ?';
                        const params = [rows[0].id];
                        connection.query(query, params, (err, trips) =>{
                            const allTrips = trips.map(trip => {return {id: trip.id, name: trip.name}});
                            console.log(allTrips);
                            res.send({ok: true, success: true, username: rows[0].username, userid: rows[0].id, trips: allTrips});
                        })
                    }
                    else{
                        console.error("Error 1");
                        res.send({ok: true, success: false})
                    }
                });
            }
            else{
                res.send({ok: true, success: false})
            }
            
        }
        else {
            console.error(err);
            res.send({ok: false});
        }
    })
});

app.get('/logout', (req, res) => {
    res.send({ok: true});
});

app.post('/trip', (req, res) => {
    const userid = req.body.userid;
    const query = `INSERT INTO trip(userid, name) VALUES (?, 'New Trip')`;
    const params = [userid];
    connection.query(query, params, (err, result) => {
        if(!err){
            res.send({ok: true, id: result.insertId});
        }
        else{
            res.send({ok: false});
        }
    });
});

app.patch('/trip', (req, res) => {
    const id = req.body.id;
    const name = req.body.name;
    const query = 'UPDATE trip SET name = ? WHERE id = ?';
    const params = [name, id];
    connection.query(query, params, (err, result) => {
        if(!err){
            res.send({ok: true});
        }
        else{
            console.error(err);
        }
    })
});

app.delete('/trip', (req, res) => {
    const id = req.body.id;
    console.log(JSON.stringify(req.body.id));
    const query = "DELETE FROM trip WHERE id = ?";
    const params = [id];
    connection.query(query, params, (err, response) => {
        if(!err){
            res.send({ok: true});
        }
        else{
            console.error(err);
        }
    })
});

app.get('/trip/:id', (req, res) => {
    const id = req.params.id;
    query = "SELECT * FROM destination WHERE tripid = ?";
    params = [id];
    connection.query(query, params, (err, rows) => {
        if(!err){
            const destinations = rows.map(row => ({id: row.id, name: row.name, dindex: row.dindex, tripid: row.tripid, placeid: row.placeid }));
            res.send({ok: true, destinations: destinations});
        }
        else{
            console.error(err);
        }
    })
});

app.get('/sessiontoken/:id', (req, res) => {
    const query = "SELECT sessiontoken FROM user WHERE id = ?";
    const params = [req.params.id];
    console.log(JSON.stringify(req.params));
    connection.query(query, params, (err, rows) => {
        if(!err){
            console.log(JSON.stringify(rows));
            let token = rows[0].sessiontoken;
            const query = "UPDATE user SET sessiontoken = ? WHERE id = ?";
            const params = [token + 1, req.params.id];
            connection.query(query, params, (err, rows) => {
                if(!err){
                    token = req.params.id + "a" + token;
                    console.log(token);
                    res.send({ok: true, token});
                }
                else{
                    console.error("Error updating session token");
                }     
            });
        }
        else{
            console.error("Error getting session token");
        }
    });
});

app.post('/autocomplete', (req, res) =>{
        const token = req.body.token;
        const text = req.body.text;
        //TODO: turn spaces into + signs and abort if a character contains non-number,alpha, or space
        console.log(`${autocompleteHost}&sessiontoken=${token}&input=${text}`);
        fetch(`${autocompleteHost}&sessiontoken=${token}&input=${text}`)
        .then(response => response.json())
        .then(data => {
            if(data.status === "OK"){
                console.log(data);
                const guesses = data.predictions.map(prediction => {return {id: prediction.id, name: prediction.description}});
                res.send({ok: true, guesses});
            }
            else{
                console.error(data);
                res.send({ok: true, guesses: []});
            }
        })
        .catch(err => console.error(err));
    }
);


app.listen(port, () => {
    console.log(`Listening on port ${port}`);
});