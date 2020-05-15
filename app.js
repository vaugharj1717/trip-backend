const express = require('express');
const app = express();
const cors = require('cors');
const mysql = require('mysql');
const fs = require('fs');
const session = require('express-session');
const fetch = require('node-fetch');

app.use(cors());
app.use(express.json());
app.use(session({secret: "shhh", saveUninitialized: false, resave: true}));


const port = 3444;
const apikey = 'AIzaSyD3R07jX6usCTX87A-DfeU_FegLewiZxWw';

//Google API URLs
const autocompleteHost = `https://maps.googleapis.com/maps/api/place/autocomplete/json?key=${apikey}&types=(cities)&components=country:us`;
const detailsHost = `https://maps.googleapis.com/maps/api/place/details/json?key=${apikey}&fields=photo,url,address_component,utc_offset`;
const photoHost = `https://maps.googleapis.com/maps/api/place/photo?key=${apikey}&maxwidth=1600`;
const distanceHost = `https://maps.googleapis.com/maps/api/distancematrix/json?key=${apikey}&units=imperial`;


let credentials = JSON.parse(fs.readFileSync('credentials.json', 'utf-8'));
let connection = mysql.createConnection(credentials);
connection.connect();

//find duration and distance between two locations using Google Distance Matrix API
function getDurAndDist(first, second){
    return new Promise( (resolve, reject) => {
        fetch(`${distanceHost}&origins=place_id:${first}&destinations=place_id:${second}`)
        .then(response => response.json())
        .then(data => {
            if(data.status === "OK" && data.rows[0].elements[0].duration && data.rows[0].elements[0].distance){
                resolve({
                    dur: data.rows[0].elements[0].duration.text,
                    dist: data.rows[0].elements[0].distance.text
                });
            }
            else{
                throw new Error(JSON.stringify(data));
            } 
        })
        .catch(err => reject(err));
    })
}


// //TODO: Implement more robust authentication scheme
// app.use(function(req, res, next) {
//     if (req.session && req.session.user) {
//         req.userid = req.session.userid;
//     }
//     next();
// });


app.post('/register', (req, res) => {
    const username = req.body.username;
    const email = req.body.email;
    const password = req.body.password;
    const query = 'INSERT INTO user(username, password, email) VALUES (?, ?, ?)';
    const params = [username, password, email];
    connection.query(query, params, (err, result) => {
        if(!err){
            res.send({ok: true, id: result.insertId});
        }
        else {  //failed query
            res.send({ok: false});
        }
    });
});

app.post('/login', async (req, res) => {
    const username = req.body.username;

    //search for user credentials in database
    const query = "SELECT id, username, password FROM user u WHERE username = ?";
    const params = [username];
    connection.query(query, params, (err, rows) => {
        if(!err){
            if(rows.length > 0 && rows[0].password === req.body.password){
                //Select all user trips
                const query = 'SELECT id, name FROM trip WHERE userid = ?';
                const params = [rows[0].id];
                connection.query(query, params, (err, trips) =>{
                    if(!err){
                        const allTrips = trips.map(trip => {return {id: trip.id, name: trip.name}});
                        res.send({ok: true, success: true, username: rows[0].username, userid: rows[0].id, trips: allTrips});
                    }
                    else{   //error with query
                        res.send({ok: false})
                    }
                });
            }
            else {  //invalid credentials
                console.error(err);
                res.send({ok: false, success: false});
            }
        }
        else{
            res.send({ok: false, success: false})
            console.error(err);
        }
    })
});

//Useless for now. Keeping for when more robust authentication is added
app.get('/logout', (req, res) => {
    res.send({ok: true});
});

//Add new trip to database
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

//Change name of trip
app.patch('/trip', (req, res) => {
    const id = req.body.id;
    const name = req.body.name;
    const query = 'UPDATE trip SET name = ? WHERE id = ?';
    const params = [name, id];
    connection.query(query, params, (err) => {
        if(!err){
            res.send({ok: true});
        }
        else{
            console.error(err);
        }
    })
});

//Delete trip
app.delete('/trip', (req, res) => {
    const id = req.body.id;
    //delete trip
    const query = "DELETE FROM trip WHERE id = ?";
    const params = [id];
    connection.query(query, params, (err) => {
        if(!err){
            //delete all accompanying destinations
            const query = "DELETE FROM destination WHERE tripid = ?";
            const params = [id];
            connection.query(query, params, (err) => {
                if(!err){
                    res.send({ok: true});
                }
                else{   //Error with destination deletion
                    console.error(err);
                }
            })
        }
        else{   //Error with trip deletion
            console.error(err);
        }
    })
});

//Get all destinations for a given trip
app.get('/trip/:id/destination', (req, res) => {
    const id = req.params.id;
    query = "SELECT * FROM destination WHERE tripid = ?";
    params = [id];
    connection.query(query, params, (err, rows) => {
        if(!err){
            const destinations = rows.map(row => {
                //if photo exists, send back full URL to retrieve photo from client-side
                let photoref = row.fetchphotourl;
                const fetchphotourl = photoref === "nophoto" ? "nophoto" : `${photoHost}&photoreference=${row.fetchphotourl}`;
                return {
                    id: row.id, 
                    name: row.name, 
                    dindex: row.dindex, 
                    tripid: row.tripid, 
                    placeid: row.placeid, 
                    url:row.url, 
                    fetchphotourl: fetchphotourl,
                    dist: row.dist, 
                    dur: row.dur, 
                    utcoffset: row.utcoffset, 
                    text: row.text, 
                    arrival: {
                        month: row.month, 
                        day: row.day, 
                        year: row.year, 
                        hour: row.hour, 
                        min: row.min, 
                        half: row.half
                    }, 
                    departure: {
                        month: row.depMonth, 
                        day: row.depDay, 
                        year: row.depYear, 
                        hour: row.depHour, 
                        min: row.depMin, 
                        half: row.depHalf}
                    }
                });
            res.send({ok: true, destinations: destinations});
        }
        else{   //error with query
            console.error(err);
        }
    });
});

//Create new destination
app.post('/trip/:tripid/destination', async (req, res) => {
    const placeid = req.body.placeid;
    const index = req.body.index;
    const name = req.body.newName;
    const token = req.body.token;
    const tripid = req.params.tripid;

    //variables for detecting edge cases
    let first = false;
    let last = false;
    let only = false;

    //check if this is the first destination
    if(index == 0) first = true;

    //URL for details of user-selected destination
    const url = `${detailsHost}&place_id=${placeid}&sessiontoken=${token}`;

    //Issue request to Google Place Details service
    fetch(url)
    .then(response => response.json())
    .then(data => {
        if(data.status === 'OK'){
            //retrieve google maps url, photo reference ID, and UTC offset from details
            const url = data.result.url;
            let photoRef;
            if(data.result.photos) photoRef = data.result.photos[0].photo_reference;
            else photoRef = "nophoto";
            let fetchphotourl;
            fetchphotourl = photoRef === "nophoto" ? "nophoto" : `${photoHost}&photoreference=${photoRef}`;
            const utcoffset = data.result.utc_offset;

            
            connection.beginTransaction(err => {
                if(err){
                    connection.rollback();
                    throw Error(err);
                }
                //Update indexes of other destinations of the trip
                const query = "UPDATE destination SET dindex = dindex + 1 WHERE dindex >= ? AND tripid = ?";
                const params = [index, tripid];
                connection.query(query, params, (err, result) => {
                    if(!err){
                        //Insert new destination into database
                        const query = "INSERT INTO destination(name, dindex, tripid, placeid, url, fetchphotourl, utcoffset, month, day, year, hour, min, half) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
                        const params = [name, index, tripid, placeid, url, photoRef, utcoffset, "01", "01", "2020", "12", "00", "AM"];
                        connection.query(query, params, (err, resultWithId) => {
                            if(!err){
                                //Select destination before and after new one
                                const query = "SELECT * FROM destination WHERE tripid = ? AND (dindex = ? OR dindex = ?) ORDER BY dindex asc"
                                const params = [tripid, index - 1, index + 1];
                                connection.query(query, params, (err, result) => {
                                    if(!err){
                                        const otherDests = result.map(row => {return {id: row.id, placeid: row.placeid}})
                                        //If only one destination retrieved and new destination isn't the first one of the trip, it must be last destination
                                        if(otherDests.length == 1 && !first) last = true;
                                        //If no destinations retrieved, this is the only destination
                                        if(otherDests.length == 0) only = true;
                                        
                                        //If the destination is not an edge case (i.e. first, last, or only destination), then calculate
                                        //the duration and distance of the previous destination to the new destiantion, and also
                                        //the duration and distance of the new destination to the subsequent destination
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
                                                                res.send({ok:true, id: resultWithId.insertId, url: url, fetchphotourl: fetchphotourl, durdist1: durdists[0], durdist2: durdists[1], utcoffset: utcoffset, arrival: {month: "01", day: "01", year: "2020", hour: "12", min: "00", half: "AM"}, departure: {month: "01", day: "01", year: "2020", hour: "12", min: "00", half: "AM"}});
                                                            }
                                                            else{   //error updating previous destinatoin's distance and duration
                                                                connection.rollback();
                                                                console.error(err);
                                                                res.send({ok: false});
                                                            }
                                                        })
                                                    }
                                                    else {  //error updating new destination's distance and duration
                                                        connection.rollback();
                                                        res.send({ok: false});
                                                        console.error(err);
                                                    };
                                                })
                                            })
                                            .catch(err => { //error with google Distance Matrix API request
                                                connection.rollback();
                                                res.send({ok: false});
                                                console.error(err);
                                            });
                                        }

                                        //if destination is only destination on trip, do not calculate any distances
                                        else if(only){
                                            connection.commit()
                                            res.send({ok:true, id: resultWithId.insertId, url: url, fetchphotourl: fetchphotourl, durdist1: {dur: null, dist: null}, durdist2: {dur: null, dist: null}, utcoffset: utcoffset, arrival: {month: "01", day: "01", year: "2020", hour: "12", min: "00", half: "AM"}, departure: {month: "01", day: "01", year: "2020", hour: "12", min: "00", half: "AM"}});
                                        }

                                        //if destination is first, just calculate it's distance to the next destination
                                        else if(first){
                                            getDurAndDist(placeid, otherDests[0].placeid)
                                            .then(durdist => {
                                                const updateDurDistQuery = "UPDATE destination SET dur = ?, dist = ? WHERE tripid = ? and dindex = ?";
                                                const updateDurDistParams2 = [durdist.dur, durdist.dist, tripid, index];
                                                connection.query(updateDurDistQuery, updateDurDistParams2, (err, updateres) => {
                                                    if(!err){
                                                        connection.commit();
                                                        res.send({ok:true, id: resultWithId.insertId, url: url, fetchphotourl: fetchphotourl, durdist1: {dur: null, dist: null}, durdist2: durdist, utcoffset: utcoffset, arrival: {month: "01", day: "01", year: "2020", hour: "12", min: "00", half: "AM"}, departure: {month: "01", day: "01", year: "2020", hour: "12", min: "00", half: "AM"}});
                                                    }
                                                    else{   //error with updating distance and duration
                                                        connection.rollback();
                                                        console.error(err);
                                                        res.send({ok: false});
                                                    }
                                                })
                                            })
                                            .catch(err => { //error with google Distance Matrix API request
                                                connection.rollback();
                                                console.error(err);
                                                res.send({ok: false});
                                            });
                                        }

                                        //if destination is last, just calculate the duration and distance of previous destination to new destination
                                        else if(last){
                                            getDurAndDist(otherDests[0].placeid, placeid)
                                            .then(durdist => {
                                                const updateDurDistQuery = "UPDATE destination SET dur = ?, dist = ? WHERE tripid = ? and dindex = ?";
                                                const updateDurDistParams1 = [durdist.dur, durdist.dist, tripid, index - 1];
                                                connection.query(updateDurDistQuery, updateDurDistParams1, (err, updateres) => {
                                                    if(!err){
                                                        connection.commit();
                                                        res.send({ok:true, id: resultWithId.insertId, url: url, fetchphotourl: fetchphotourl, durdist1: durdist, durdist2: {dur: null, dist: null}, utcoffset: utcoffset, arrival: {month: "01", day: "01", year: "2020", hour: "12", min: "00", half: "AM"}, departure: {month: "01", day: "01", year: "2020", hour: "12", min: "00", half: "AM"}});
                                                    }
                                                    else{   //error with updating destination and distance
                                                        connection.rollback();
                                                        console.error(err);
                                                        res.send({ok: false});
                                                    }
                                                })
                                            })
                                            .catch(err => { //error with google Distance Matrix API request
                                                connection.rollback();
                                                console.error(err);
                                                res.send({ok: false});
                                            });
                                        }
                                    }
                                    else{   //Error selecting previous and subsequent destinations
                                        connection.rollback();
                                        console.error(err);
                                        res.send({ok: false});
                                    }      
                                })     
                            }
                            else{   //error inserting new destination into database
                                connection.rollback();
                                console.error(err);
                                res.send({ok: false});
                            }
                        });
                    } else{     //Error updating indexes of other destinations on the trip
                        connection.rollback();
                        console.error(err);
                        res.send({ok: false});
                    }
                })
            })
        }
        else{   //Error with google details request
            connection.rollback();
            console.error(err);
            res.send({ok: false});
        }
    })      //Error with google details request
    .catch(err => {
        console.error(err);
        res.send({ok: false});
    })
});

//Update destination's text
app.patch('/trip/:tripid/destination/:id', (req, res) => {
    const tripid = req.params.tripid;
    const id = req.params.id;
    const text = req.body.text;
    const query = "UPDATE destination SET text = ? WHERE tripid = ? AND id = ?";
    const params = [text, tripid, id];
    connection.query(query, params, (err) => {
        if(!err){
            res.send({ok: true});
        }
        else{
            res.send({ok: false});
        }
    });
});

//Update arrival date for a destination
app.patch('/trip/:tripid/destination/:id/arrival', (req, res) => {
    const tripid = req.params.tripid;
    const id = req.params.id;
    const month = req.body.month;
    const day = req.body.day;
    const year = req.body.year;
    const hour = req.body.hour;
    const min = req.body.min;
    const half = req.body.half;
    const query = "UPDATE destination set month = ?, day = ?, year = ?, hour = ?, min = ?, half = ? WHERE id = ? AND tripid = ?";
    const params = [month, day, year, hour, min, half, id, tripid];
    connection.query(query, params, (err, result) => {
        if(!err){
            res.send({ok: true});
        }
        else{
            res.send({ok: false});
        }
    })
});

//update departure date for a destination
app.patch('/trip/:tripid/destination/:id/departure', (req, res) => {
    const tripid = req.params.tripid;
    const id = req.params.id;
    const month = req.body.month;
    const day = req.body.day;
    const year = req.body.year;
    const hour = req.body.hour;
    const min = req.body.min;
    const half = req.body.half;
    const query = "UPDATE destination set depMonth = ?, depDay = ?, depYear = ?, depHour = ?, depMin = ?, depHalf = ? WHERE id = ? AND tripid = ?";
    const params = [month, day, year, hour, min, half, id, tripid];
    connection.query(query, params, (err, result) => {
        if(!err){
            res.send({ok: true});
        }
        else{
            res.send({ok: false});
        }
    })
});

//Delete a destination
app.delete('/trip/:tripid/destination/:id', (req, res) => {
    const id = req.params.id; 
    const tripid = req.params.tripid; 
    const dindex = req.body.dindex;

    //variables for edge case detection
    let first = false;
    let last = false;
    let only = false;

    //detect if deleted destination is first destination
    if(dindex == 0) first = true;
    
    connection.beginTransaction(err => {
        if(!err){
            //Delete trip
            const query = "DELETE FROM destination WHERE id = ?";
            params = [id];
            connection.query(query, params, (err) => {
                if(!err){
                    //Update indexes
                    const query = "UPDATE destination SET dindex = dindex - 1 WHERE dindex > ? AND tripid = ?";
                    const params = [dindex, tripid];
                    connection.query(query, params, (err, result) => {
                        if(!err){
                            //Select adjacent destinations
                            const query = "SELECT id, placeid FROM destination WHERE (dindex = ? OR dindex = ?) AND tripid = ?";
                            const params = [dindex - 1, dindex, tripid];
                            connection.query(query, params, (err, result) => {
                                if(!err){
                                    //check if deleted destination was last destination or only destination
                                    const otherDests = result.map(row => {return {id: row.id, placeid: row.placeid}});
                                    if(otherDests.length == 1 && !first) last = true;
                                    if(otherDests.length == 0) only = true;
                                    //if first or only, no work to do
                                    if(first || only){
                                        connection.commit();
                                        res.send({ok: true, durdist: null});
                                    }
                                    //if deleted destination was last destination, set previous destination's distance and duration to null
                                    else if(last){
                                        const query = "UPDATE destination SET dist = null, dur = null WHERE dindex = ? AND tripid = ?";
                                        const params = [dindex - 1, tripid];
                                        connection.query(query, params, (err, result) => {
                                            if(!err){
                                                connection.commit();
                                                res.send({ok: true, durdist: null});
                                            }
                                            else{   //error updating distance and duration of previous destination
                                                console.error(err);
                                                connection.rollback();
                                                res.send({ok: false})
                                            }
                                        })
                                    }

                                    //else find new duration and distance for preceding destination
                                    else{
                                        //make call to Google Distance Matrix API
                                        getDurAndDist(otherDests[0].placeid, otherDests[1].placeid)
                                        .then(durdist => {
                                            //Update distance/duration of preceding destination in database
                                            const query = "UPDATE destination SET dist = ?, dur = ? WHERE dindex = ? AND tripid = ?";
                                            const params = [durdist.dist, durdist.dur, dindex - 1, tripid];
                                            connection.query(query, params, (err) => {
                                                if(!err){
                                                    connection.commit();
                                                    res.send({ok:true, durdist: durdist});
                                                }
                                                else{   //Error updating distance/duration of previous destination
                                                    console.error(err);
                                                    connection.rollback();
                                                    res.send({ok: false});
                                                }
                                            })
                                        })  //error with Google Distance Matrix API call
                                        .catch(err => {
                                            console.error(err);
                                            connection.rollback();
                                            res.send({ok: false});
                                        })
                                    }
                                }
                                else{   //error selecting adjacent destinations
                                    console.error(err);
                                    connection.rollback();
                                    res.send({ok: false});
                                }
                            })
                        }
                        else{   //error updating indexes
                            console.error(err);
                            connection.rollback();
                            res.send({ok: false})
                        }
                    });  
                }
                else{   //error deleting destination
                    console.error(err);
                    connection.rollback();
                    res.send({ok: false});
                }
            })
        }
    });
});

//Google Autocomplete API Management endpoints
app.get('/sessiontoken/:id', (req, res) => {
    //use userID + 'a' + incremented session token ID to form unique session token
    const query = "SELECT sessiontoken FROM user WHERE id = ?";
    const params = [req.params.id];
    connection.query(query, params, (err, rows) => {
        if(!err){
            //Increment session token for user
            let token = rows[0].sessiontoken;
            const query = "UPDATE user SET sessiontoken = ? WHERE id = ?";
            const params = [token + 1, req.params.id];
            connection.query(query, params, (err, rows) => {
                if(!err){
                    token = req.params.id + "a" + token;
                    res.send({ok: true, token});
                }
                else{   //error incrementing session token id
                    console.error("Error updating session token");
                }     
            });
        }
        else{   //error selecting session token
            console.error("Error getting session token");
        }
    });
});

//Issue autocomplete to Google Places Autocomplete service
app.post('/autocomplete', (req, res) =>{
        const token = req.body.token;
        const text = req.body.text;
        //issue request to Google Places Autocomplete
        fetch(`${autocompleteHost}&sessiontoken=${token}&input=${text}`)
        .then(response => response.json())
        .then(data => {
            if(data.status === "OK"){
                const guesses = data.predictions.map(prediction => {
                    return {id: prediction.place_id, name: prediction.description}});
                res.send({ok: true, guesses});
            }
            else{   //error with autocomplete request
                console.error(data);
                res.send({ok: true, guesses: []});
            }
        })
        .catch(err => console.error(err));  //error with autocomplete request
    }
);





//cases: Only or first (do nothing), last (set previous to null), middle (set previous to new value)

app.listen(port, () => {
    console.log(`Listening on port ${port}`);
});
