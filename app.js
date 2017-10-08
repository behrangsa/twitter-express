'use strict';

const oauth = require('oauth');
const express = require('express');
const session = require('express-session');
const LokiStore = require('connect-loki')(session);
const Twitter = require('twitter');

const app = express();

const CONSUMER_KEY = process.env.CONSUMER_KEY;
const CONSUMER_SECRET = process.env.CONSUMER_SECRET;

const OA = new oauth.OAuth(
    'https://api.twitter.com/oauth/request_token',
    'https://api.twitter.com/oauth/access_token',
    CONSUMER_KEY,
    CONSUMER_SECRET,
    '1.0A',
    null,
    'HMAC-SHA1'
);

app.use(express.static('public'));
app.use(session({
    store: new LokiStore({}),
    secret: 'cookie secret',
    cookie: {maxAge: 24 * 60 * 60 * 1000} // 24 hours
}));

function handleError(error, statusCode, res) {
    console.log({
        error: error
    });

    res.status(statusCode).send({
        error: error
    });
}

app.get('/auth/twitter', function (req, res) {
    OA.getOAuthRequestToken(
        function (error, oAuthToken, oAuthTokenSecret, results) {
            if (error) {
                handleError(error, 401, res);
                return;
            }

            console.log(oAuthToken, oAuthTokenSecret, results);

            req.session.requestToken = {
                oauthToken: oAuthToken,
                oauthTokenSecret: oAuthTokenSecret,
                results: results
            };

            req.session.save();

            res.redirect(`https://api.twitter.com/oauth/authenticate?oauth_token=${oAuthToken}`);
        }
    );
});

app.get('/auth/twitter/callback', function (req, res) {
    let oauthToken = req.session.requestToken.oauthToken;
    let oauthTokenSecret = req.session.requestToken.oauthTokenSecret;
    let oauthVerifier = req.query.oauth_verifier;

    OA.getOAuthAccessToken(oauthToken, oauthTokenSecret, oauthVerifier, function (error, accessToken, accessTokenSecret, results) {
            if (error) {
                handleError(error, 401, res);
                return;
            }

            OA.get('https://api.twitter.com/1.1/account/verify_credentials.json', accessToken, accessTokenSecret, function (error, twitterResponseData, result) {
                if (error) {
                    handleError(error, 401, res);
                    return;
                }

                req.session.twitterSession = {
                    accessToken: accessToken,
                    accessTokenSecret: accessTokenSecret,
                    profile: twitterResponseData
                };

                req.session.save();

                res.redirect('http://localhost:3000');
            });
        }
    );
});

app.get('/auth/me', function (req, res) {
    let twitterSession = req.session.twitterSession;

    if (twitterSession && twitterSession.profile) {
        res.send(twitterSession.profile);
    } else {
        res.status(401).send({});
    }
});

app.get('/auth/logout', function (req, res) {
    req.session.destroy();

    res.redirect('http://localhost:3000');
});

app.post('/tweet', function (req, res) {
    let secret = {
        consumer_key: CONSUMER_KEY,
        consumer_secret: CONSUMER_SECRET,
        access_token_key: req.session.twitterSession.accessToken,
        access_token_secret: req.session.twitterSession.accessTokenSecret
    };

    let tw = new Twitter(secret);

    tw.post('statuses/update', {status: 'Test'}, function (error, tweet, response) {
        if (error) {
            console.log(error);
        }

        console.log(tweet);  // Tweet body.
        console.log(response);  // Raw response object.

        res.send({
            tweet: tweet,
            response: response
        });
    });
});

app.listen(3000, function () {
    console.log('Started Twitter Express');
});