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
const detailsHost = `https://maps.googleapis.com/maps/api/place/details/json?key=${apikey}&fields=photo,url`;
const photoHost = `https://maps.googleapis.com/maps/api/place/photo?key=${apikey}&maxwidth=300`;
const distanceHost = `https://maps.googleapis.com/maps/api/distancematrix/json?key=${apikey}`;


let credentials = JSON.parse(fs.readFileSync('credentials.json', 'utf-8'));
let connection = mysql.createConnection(credentials);
connection.connect();

//find distance from before to this, and from this to next
function getDurAndDist(first, second){
    return new Promise( (resolve, reject) => {
        fetch(`${distanceHost}&origins=place_id:${first}&destinations=place_id:${second}`)
        .then(response => response.json())
        .then(data => {
            if(data.status === "OK"){
                resolve({
                    dur: data.rows[0].elements[0].duration.value,
                    dist: data.rows[0].elements[0].distance.value
                });
            }
            else{
                reject(new Error(JSON.stringify(data)));
            } 
            
        })
        
    })
}

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
    const query = "DELETE FROM trip WHERE id = ?";
    const params = [id];
    connection.query(query, params, (err, response) => {
        if(!err){
            const query = "DELETE FROM destination WHERE tripid = ?";
            const params = [id];
            connection.query(query, params, (err, response) => {
                if(!err){
                    res.send({ok: true});
                }
                else{
                    console.error(err);
                }
            })
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
            const destinations = rows.map(row => ({id: row.id, name: row.name, dindex: row.dindex, tripid: row.tripid, placeid: row.placeid, url:row.url, fetchphotourl:`${photoHost}&photoreference=${row.fetchphotourl}`, dist: row.dist, dur: row.dur}));
            res.send({ok: true, destinations: destinations});
        }
        else{
            console.error(err);
        }
    });
});

app.get('/sessiontoken/:id', (req, res) => {
    const query = "SELECT sessiontoken FROM user WHERE id = ?";
    const params = [req.params.id];
    connection.query(query, params, (err, rows) => {
        if(!err){
            let token = rows[0].sessiontoken;
            const query = "UPDATE user SET sessiontoken = ? WHERE id = ?";
            const params = [token + 1, req.params.id];
            connection.query(query, params, (err, rows) => {
                if(!err){
                    token = req.params.id + "a" + token;
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
        fetch(`${autocompleteHost}&sessiontoken=${token}&input=${text}`)
        .then(response => response.json())
        .then(data => {
            if(data.status === "OK"){
                const guesses = data.predictions.map(prediction => {return {id: prediction.place_id, name: prediction.description}});
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

app.post('/trip/:tripid/destination', async (req, res) => {
    const placeid = req.body.placeid;
    const index = req.body.index;
    const name = req.body.name;
    const token = req.body.token;
    const tripid = req.params.tripid;
    const url = `${detailsHost}&place_id=${placeid}&sessiontoken=${token}`;

    let first = false;
    let last = false;
    let only = false;
    if(index == 0) first = true;
    fetch(url)
    .then(response => response.json())
    .then(data => {
        if(data.status === 'OK'){
            const url = data.result.url;
            let photoRef;
            if(data.result.photos) photoRef = data.result.photos[0].photo_reference;
            else photoRef = "nophoto";
            const fetchphotourl = `${photoHost}&photoreference=${photoRef}`;

            //Update indexes of other destinations
            const query = "UPDATE DESTINATION SET dindex = dindex + 1 WHERE dindex >= ? AND tripid = ?";
            const params = [index, tripid];
            connection.beginTransaction(err => {
                if(err){
                    connection.rollback();
                    throw Error(err);
                }
                connection.query(query, params, (err, result) => {
                    if(!err){
                        //Insert new destination
                        const query = "INSERT INTO DESTINATION(name, dindex, tripid, placeid, url, fetchphotourl) values (?, ?, ?, ?, ?, ?)";
                        const params = [name, index, tripid, placeid, url, photoRef];
                        connection.query(query, params, (err, resultWithId) => {
                            if(!err){
                                //select destination before and after this one
                                const query = "SELECT * FROM DESTINATION WHERE tripid = ? AND (dindex = ? OR dindex = ?) ORDER BY dindex asc"
                                const params = [tripid, index - 1, index + 1];
                                connection.query(query, params, (err, result) => {
                                    if(!err){
                                        const otherDests = result.map(row => {return {id: row.id, placeid: row.placeid}})
                                        if(otherDests.length == 1 && !first) last = true;
                                        if(otherDests.length == 0) only = true;
                                        
                                        //if destination is a middle index, calculate it's new distance, and the destination before it
                                        if(!first && !last && !only){
                                            Promise.all([getDurAndDist(otherDests[0].placeid, placeid), getDurAndDist(placeid, otherDests[1].placeid)])
                                            .then(durdists => {
                                                const updateDurDistQuery = "UPDATE destination SET dur = ?, dist = ? WHERE tripid = ? and dindex = ?";
                                                const updateDurDistParams1 = [durdists[0].dur, durdists[0].dist, tripid, index - 1];
                                                const updateDurDistParams2 = [durdists[1].dur, durdists[1].dist, tripid, index];
                                                connection.query(updateDurDistQuery, updateDurDistParams1, (err, updateres) => {
                                                    if(!err){
                                                        connection.query(updateDurDistQuery, updateDurDistParams2, (err, updateres) => {
                                                            if(!err){
                                                                connection.commit();
                                                                res.send({ok:true, id: resultWithId.insertId, url: url, fetchphotourl: fetchphotourl, durdist1: durdists[0], durdist2: durdists[1]});
                                                            }
                                                            else{
                                                                connection.rollback();
                                                                throw Error(err);
                                                            }
                                                        })
                                                    }
                                                    else {
                                                        connection.rollback();
                                                        throw Error(err);
                                                    };
                                                })
                                            })
                                            .catch(err =>{
                                                connection.rollback();
                                                throw Error(err);
                                            });
                                        }

                                        //if destination is only destination on trip, do not calculate distance
                                        else if(only){
                                            connection.commit()
                                            res.send({ok:true, id: resultWithId.insertId, url: url, fetchphotourl: fetchphotourl, durdist1: {dur: null, dist: null}, durdist2: {dur: null, dist: null}});
                                        }

                                        //if destination is first, just calculate it's distance
                                        else if(first){
                                            getDurAndDist(placeid, otherDests[0].placeid)
                                            .then(durdist => {
                                                const updateDurDistQuery = "UPDATE destination SET dur = ?, dist = ? WHERE tripid = ? and dindex = ?";
                                                const updateDurDistParams2 = [durdist.dur, durdist.dist, tripid, index];
                                                connection.query(updateDurDistQuery, updateDurDistParams2, (err, updateres) => {
                                                    if(!err){
                                                        connection.commit();
                                                        res.send({ok:true, id: resultWithId.insertId, url: url, fetchphotourl: fetchphotourl, durdist1: {dur: null, dist: null}, durdist2: durdist});
                                                    }
                                                    else{
                                                        connection.rollback();
                                                        throw Error(err);
                                                    }
                                                })
                                            })
                                        }

                                        //if destination is last, just calculate the dist of destination before it
                                        else if(last){
                                            getDurAndDist(otherDests[0].placeid, placeid)
                                            .then(durdist => {
                                                const updateDurDistQuery = "UPDATE destination SET dur = ?, dist = ? WHERE tripid = ? and dindex = ?";
                                                const updateDurDistParams1 = [durdist.dur, durdist.dist, tripid, index - 1];
                                                connection.query(updateDurDistQuery, updateDurDistParams1, (err, updateres) => {
                                                    if(!err){
                                                        connection.commit();
                                                        res.send({ok:true, id: resultWithId.insertId, url: url, fetchphotourl: fetchphotourl, durdist1: durdist, durdist2: {dur: null, dist: null}});
                                                    }
                                                    else{
                                                        connection.rollback();
                                                        throw Error(err);
                                                    }
                                                })
                                            })
                                        }
                                    }
                                    else{
                                        connection.rollback();
                                        throw Error(err);
                                    }      
                                })     
                            }
                            else{
                                connection.rollback();
                                throw Error(err);
                            }
                        });
                    } else{
                        connection.rollback();
                        throw Error(err);
                    }
                })
            })
        }
        else{
            connection.rollback();
            throw Error(err);
        }
    })
    .catch(err => {
        console.error(err);
        res.send({ok: false});
    })
});

//TODO: Delete all places associated with this trip
app.delete('/trip/:tripid/destination/:id', (req, res) => {
    const id = req.params.id; const tripid = req.params.tripid; const dindex = req.body.dindex;
    let first = false; let last = false; let only = false;
    if(dindex == 0) first = true;
    
    connection.beginTransaction(err => {
        if(!err){
            //Delete trip
            const query = "DELETE FROM destination WHERE id = ?";
            params = [id];
            connection.query(query, params, (err, result) => {
                if(!err){
                    //Update indexes
                    const query = "UPDATE destination SET dindex = dindex - 1 WHERE dindex > ? AND tripid = ?";
                    const params = [dindex, tripid];
                    connection.query(query, params, (err, result) => {
                        if(!err){
                            //Select rows to have distance updated
                            const query = "SELECT id, placeid FROM destination WHERE (dindex = ? OR dindex = ?) AND tripid = ?";
                            const params = [dindex - 1, dindex, tripid];
                            connection.query(query, params, (err, result) => {
                                if(!err){
                                    //check if destination was last or only on trip
                                    const otherDests = result.map(row => {return {id: row.id, placeid: row.placeid}});
                                    if(otherDests.length == 1 && !first) last = true;
                                    if(otherDests.length == 0) only = true;
                                    //if first or only, no work to do
                                    if(first || only){
                                        connection.commit();
                                        res.send({ok: true, durdist: null});
                                    }
                                    //if last, update previous destination to be null
                                    else if(last){
                                        const query = "UPDATE destination SET dist = null, dur = null WHERE dindex = ? AND tripid = ?";
                                        const params = [dindex - 1, tripid];
                                        connection.query(query, params, (err, result) => {
                                            if(!err){
                                                connection.commit();
                                                res.send({ok: true, durdist: null});
                                            }
                                            else{
                                                console.error(err);
                                                connection.rollback();
                                                res.send({ok: false})
                                            }
                                        })
                                    }
                                    //else find new dur/dist for preeding destination
                                    else{
                                        getDurAndDist(otherDests[0].placeid, otherDests[1].placeid)
                                        .then(durdist => {
                                            //and update preceding destination in database
                                            const query = "UPDATE destination SET dist = ?, dur = ? WHERE dindex = ? AND tripid = ?";
                                            const params = [durdist.dist, durdist.dur, dindex - 1, tripid];
                                            connection.query(query, params, (err, result) => {
                                                if(!err){
                                                    
                                                    connection.commit();
                                                    res.send({ok:true, durdist: durdist});
                                                }
                                                else{
                                                    console.error(err);
                                                    connection.rollback();
                                                    res.send({ok: false});
                                                }
                                            })
                                        })
                                        .catch(err => {
                                            console.error(err);
                                            connection.rollback();
                                            res.send({ok: false});
                                        })
                                    }
                                }
                                else{
                                    console.error(err);
                                    connection.rollback();
                                    res.send({ok: false});
                                }
                            })
                        }
                        else{
                            console.error(err);
                            connection.rollback();
                            res.send({ok: false})
                        }
                    });  
                }
                else{
                    console.error(err);
                    connection.rollback();
                    res.send({ok: false});
                }
            })
        }
    });
});



//cases: Only or first (do nothing), last (set previous to null), middle (set previous to new value)

app.listen(port, () => {
    console.log(`Listening on port ${port}`);
});