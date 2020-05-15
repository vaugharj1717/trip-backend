DROP TABLE IF EXISTS user;
DROP TABLE IF EXISTS trip;
DROP TABLE IF EXISTS destination;

CREATE TABLE user (
    id SERIAL PRIMARY KEY,
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
    month VARCHAR(2),
    day VARCHAR(2),
    year VARCHAR(4),
    hour VARCHAR(2),
    min VARCHAR(2),
    half VARCHAR(2),
    depMonth VARCHAR(2),
    depDay VARCHAR(2),
    depYear VARCHAR(4),
    depHour VARCHAR(2),
    depMin VARCHAR(2),
    depHalf VARCHAR(2)
);

