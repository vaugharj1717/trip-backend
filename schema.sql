DROP TABLE IF EXISTS user;
DROP TABLE IF EXISTS trip;
DROP TABLE IF EXISTS destination;

CREATE TABLE user (
    id SERIAL PRIMARY KEY,
    username VARCHAR(20),
    password VARCHAR(40),
    email VARCHAR(45),
    sessiontoken INT
);

CREATE TABLE trip (
    id SERIAL PRIMARY KEY,
    name VARCHAR(45),
    userid INT
);

CREATE TABLE destination (
    id SERIAL PRIMARY KEY,
    name VARCHAR(40),
    tripid INT,
    placeid VARCHAR(50),
    dindex INT,
    url VARCHAR(200),
    dur VARCHAR(40),
    dist VARCHAR(40),
    fetchphotourl VARCHAR(200),
    utcoffset INT,
    text VARCHAR(500),
    arrival TIMESTAMP NULL,
    departure TIMESTAMP NULL
);

