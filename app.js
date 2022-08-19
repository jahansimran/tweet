const express = require("express");
const app = express();
app.use(express.json());

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializeServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server started at http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB Error : ${e.message}`);
    process.exit(1);
  }
};
initializeServer();

const validatePassword = (password) => {
  return password.length > 6;
};

//register api
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `
          SELECT *
          FROM user 
          WHERE username = '${username}';`;

  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    const createUserQuery = `
          INSERT INTO
            user(username, password, name, gender)
          VALUES 
            ('${username}','${hashedPassword}','${name}','${gender}');`;

    if (validatePassword(password)) {
      await db.run(createUserQuery);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//login api
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `
       SELECT * 
       FROM user 
       WHERE username = '${username}';`;

  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatch = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatch === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "SECRET-TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//authenticate token
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "SECRET-TOKEN", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

const convertTweetTableToResponse = (dbObject) => {
  return {
    tweetId: dbObject.tweet_id,
    tweet: dbObject.tweet,
    userId: dbObject.user_id,
    dateTime: dbObject.date_time,
  };
};

//get tweet of user
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const selectUserTweet = `
           SELECT 
               username,
               tweet,
               date_time AS dateTime
            FROM tweet NATURAL JOIN user
            LIMIT 4;`;

  const dbUser = await db.all(selectUserTweet);
  response.send(dbUser);
});

//get user following
app.get("/user/following/", authenticateToken, async (request, response) => {
  const selectUserQuery = `
         SELECT name 
         FROM user
         INNER JOIN follower ON user.user_id = follower.follower_user_id
         ;`;
  const dbUser = await db.all(selectUserQuery);
  response.send(dbUser);
});

//get user follower
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const selectUserQuery = `
         SELECT name 
         FROM user 
         INNER JOIN follower ON user_id = follower.following_user_id;`;

  const dbUser = await db.all(selectUserQuery);
  response.send(dbUser);
});

//get tweets and tweetid
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const findUser = `
            SELECT *
            FROM user 
            INNER JOIN follower ON user_id  = follower.following_user_id;`;

  const dbTweet = await db.get(findUser);
  if (dbTweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const findTweet = `
            SELECT 
                tweet,
                COUNT(like_id) AS likes,
                COUNT(reply) AS replies,
                date_time AS dateTime
            FROM user 
              INNER JOIN tweet ON user.user_id = tweet.user_id
              INNER JOIN like ON like.tweet_id = tweet.tweet_id
              INNER JOIN reply ON reply.tweet_id = tweet.tweet_id;`;

    const finalResponse = await db.get(findTweet);
    response.send(finalResponse);
  }
});

//get tweets, tweetId and likes
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const findUser = `
            SELECT 
                *
            FROM user 
            INNER JOIN follower ON user_id  = follower.following_user_id;`;

    const dbTweet = await db.all(findUser);
    if (dbTweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const findTweet = `
            SELECT 
                like_id AS likes
            FROM user 
             INNER JOIN tweet ON  user.user_id = tweet.user_id
             INNER JOIN like On like.tweet_id = tweet.tweet_id;`;

      const finalResponse = await db.all(findTweet);
    }
  }
);

//tweet tweetid, replies
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const findUser = `
            SELECT *
            FROM user 
            INNER JOIN follower ON user_id  = follower.following_user_id;`;

    const dbTweet = await db.get(findUser);
    if (dbTweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const finalUser = `
            SELECT 
                name,
                reply
            FROM user INNER JOIN reply ON user.user_id = reply.user_id;`;

      const response = await db.all(finalUser);
    }
  }
);

//user tweets
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const findTweet = `
            SELECT 
                tweet,
                COUNT(like_id) AS likes,
                COUNT(reply) AS replies,
                date_time AS dateTime
            FROM user 
              INNER JOIN tweet ON user.user_id = tweet.user_id
              INNER JOIN like ON like.tweet_id = tweet.tweet_id
              INNER JOIN reply ON reply.tweet_id = tweet.tweet_id;`;

  const finalResponse = await db.all(findTweet);
  response.send(finalResponse);
});

//create a tweet
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const createTweet = `
       INSERT INTO
        tweet (tweet)
        VALUES ('${tweet}');`;
  await db.run(createTweet);
  response.send("Created a Tweet");
});

//delete a tweet
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const selectUser = `
          SELECT * 
          FROM user INNER JOIN tweet ON
           user.user_id = tweet.user_id;`;
    const user = db.get(selectUser);
    if (user === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteUser = `
            DELETE FROM 
                  tweet 
            WHERE tweet_id = ${tweetId};`;
      await db.run(deleteUser);
      response.send("Tweet Removed");
    }
  }
);
module.exports = app;
