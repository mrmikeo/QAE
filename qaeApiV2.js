/*
*
* QAE - Version 0.0.1
*
* Qredit Always Evolving
*
* A simplified token management system for the Qredit network
*
*/

const express     = require('express');          // call express
const app         = express();                   // define our app using express
const bodyParser  = require('body-parser');      // for post calls
const cors        = require('cors');             // Cross Origin stuff
const redis       = require('redis');            // a really fast nosql keystore
const fs          = require('fs');               // so we can read the config ini file from disk
const ini         = require('ini');              // so we can parse the ini files properties
const Big         = require('big.js');           // required unless you want floating point math issues
const nodemailer  = require('nodemailer');       // for sending error reports about this node
const crypto      = require('crypto');           // for creating hashes of things
const request     = require('request');          // Library for making http requests
const publicIp    = require('public-ip');        // a helper to find out what our external IP is.   Needed for generating proper ring signatures
const {promisify} = require('util');             // Promise functions
const asyncv3     = require('async');            // Async Helper
const { Client }  = require('pg');               // Postgres
const qreditjs    = require("qreditjs");

var iniconfig = ini.parse(fs.readFileSync('/etc/qae/qae.ini', 'utf-8'))

// Qredit API Library  TODO no longer needed
//const qreditApi = require("nodeQreditApi");
//const qapi = new qreditApi.default(iniconfig.api_node);

// Mongo Connection Details
const mongoconnecturl = iniconfig.mongo_connection_string;
const mongodatabase = iniconfig.mongo_database;

// MongoDB Library
const qaeDB = require("./lib/qaeDB");
const qdb = new qaeDB.default(mongoconnecturl, mongodatabase); /* For internal processing */
const qdbapi = new qaeDB.default(mongoconnecturl, mongodatabase); /* For the API */

// Connect to Redis and setup some async call definitions
const rclient   = redis.createClient(iniconfig.redis_port, iniconfig.redis_host,{detect_buffers: true});
const hgetAsync = promisify(rclient.hget).bind(rclient);
const hsetAsync = promisify(rclient.hset).bind(rclient);
const getAsync  = promisify(rclient.get).bind(rclient);
const setAsync  = promisify(rclient.set).bind(rclient);
const delAsync  = promisify(rclient.del).bind(rclient);

// QAE-1 Token Schema
const qaeSchema = require("./lib/qaeSchema");
const qae = new qaeSchema.default();

const qaeactivationHeight = 2859480;
const qaeactivationRingSig = 'cf7bd99a9f926f760e3481cde66dcb5f74d2f8403f0459b97537f989abbe9e1e';
const qaeactivationBlockId = 'c36c7920a5194e67c646145c54051d22f9b2f192cf458da8683e34af4a1582ac';

// Declaring some variable defaults
var myIPAddress = '';
var goodPeers = {};
var badPeers = {};
var unvalidatedPeers = {};
var scanBlockId = 0;
var lastBlockId = '';
var sigblockhash = '';
var sigtokenhash = '';
var sigaddrhash = '';
var sigtrxhash = '';
var previoushash = '';
var fullhash = '';
var processedItems = false;
var gotSeedPeers = 0;
var lastBlockNotify = Math.floor(new Date() / 1000);

// Generate Random Keys for Webhooks
var webhookToken = '';
var webhookVerification = '';

// Trusted seed node
var seedNode = iniconfig.seed_node;

// Let us know when we connect or have an error with redis
rclient.on('connect', function() {
    console.log('Connected to Redis');
});

rclient.on('error',function() {
    console.log("Error in Redis");
    error_handle("Error in Redis", 'redisConnection');
});

// Rescan Flag or Unknown last scan -  rescans all transaction (ie. #node qaeApiv2.js true)

rclient.get('qae_lastscanblock', function(err, lbreply)
{

    if ((process.argv.length == 3 && (process.argv[2] == '1' || process.argv[2] == 'true')) || lbreply == null || parseInt(lbreply) != lbreply) 
    {

        (async () => {
        
        	console.log("--------------------");
			console.log("Forcing a Rescan....");
        	console.log("--------------------");

            await delAsync('qae_lastscanblock');
            await delAsync('qae_lastblockid');
            await delAsync('qae_ringsignatures');
		
			await setAsync('qae_lastscanblock', qaeactivationHeight);
			await setAsync('qae_lastblockid', qaeactivationBlockId);
			await hsetAsync('qae_ringsignatures', qaeactivationHeight, qaeactivationRingSig);

            // Remove items from MongoDB
			
			let response = {};
			let exists = true;
                
			var mclient = await qdb.connect();
			qdb.setClient(mclient);
                
			exists = await qdb.doesCollectionExist('tokens');
			console.log("Does collection 'tokens' Exist: " + exists);
			if (exists == true)
			{
                console.log("Removing all documents from 'tokens'");
                await qdb.removeDocuments('tokens', {});
			}
			else
			{
                console.log("Creating new collection 'tokens'");
                await qdb.createCollection('tokens', {});
			}

			exists = await qdb.doesCollectionExist('addresses');
			console.log("Does collection 'addresses' Exist: " + exists);
			if (exists == true)
			{
                console.log("Removing all documents from 'addresses'");
                await qdb.removeDocuments('addresses', {});
			}
			else
			{
                console.log("Creating new collection 'addresses'");
                await qdb.createCollection('addresses', {});
			}
                
			exists = await qdb.doesCollectionExist('transactions');
			console.log("Does collection 'transactions' Exist: " + exists);
			if (exists == true)
			{
                console.log("Removing all documents from 'transactions'");
                await qdb.removeDocuments('transactions', {});
			}
			else
			{
                console.log("Creating new collection 'transactions'");
                await qdb.createCollection('transactions', {});
			}

			await qae.indexDatabase(qdb);
			
            await qdb.close();	
            
            // Initialze things
            initialize();
			
        })();
        
    }
    else
    {
        // Initialze things
        initialize(); 
    }   
    
});

// configure app to use bodyParser()
// this will let us get the data from a POST
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cors());

var port = iniconfig.api_port;

// We will keep in memory the ips that connect to us
var accessstats = [];

var scanLock = false;
var scanLockTimer = 0;

// ROUTES FOR OUR API
// =============================================================================

// get an instance of the express Router
var router = express.Router();              

// a test route to make sure everything is working (accessed at GET http://ip:port/api)
router.get('/', function(req, res) {
    res.json({ message: 'Qredit Always Evolving....  Please see our API documentation' });   
});
    
router.route('/status')
    .get(function(req, res) {
    
        (async () => {
            
            var pgclient = new Client({user: iniconfig.pg_username, database: iniconfig.pg_database, password: iniconfig.pg_password});

	    	await pgclient.connect()
	    	var dlblocks = await pgclient.query('SELECT * FROM blocks ORDER BY height DESC LIMIT 1')
	    	await pgclient.end()
            
            var scanned = await getAsync('qae_lastscanblock');
            
            if (dlblocks && dlblocks.rows)
            {
                var downloadedblocks = dlblocks.rows[0].height;
            }
            else
            {
                var downloadedblocks = 0;
            }
            
            message = {downloadedBlocks: parseInt(downloadedblocks), scannedBlocks: parseInt(scanned)};
            
            res.json(message);
                
        })();
    
    });
    
router.route('/tokens')
    .get(function(req, res) {

        var limit = 100;

        if (req.query.limit)
        {
            limit = parseInt(req.query.limit);
        }

        var page = 1;

        if (req.query.page)
        {
            page = parseInt(req.query.page);
        }
        
        var skip = (page - 1) * limit;

        var sort = {"tokenDetails.genesis_timestamp_unix":-1};
        
        //if (req.query.sort)
        //{
        //  sort = req.query.sort;
        //}

        updateaccessstats(req);
        
        var message = [];

        (async () => {
        
            var mclient = await qdbapi.connect();
            qdbapi.setClient(mclient);
            message = await qdbapi.findDocuments('tokens', {}, limit, sort, skip);

            await qdbapi.close();
            
            res.json(message);
        
        })();
        
    });

router.route('/token/:id')
    .get(function(req, res) {

        var tokenid = req.params.id;
        
        updateaccessstats(req);
        
        var message = [];

        (async () => {
        
            var mclient = await qdbapi.connect();
            qdbapi.setClient(mclient);
            message = await qdbapi.findDocuments('tokens', {'tokenDetails.tokenIdHex': tokenid});

            await qdbapi.close();
            
            res.json(message);
        
        })();
        
    });

router.route('/addresses')
    .get(function(req, res) {

        var limit = 100;

        if (req.query.limit)
        {
            limit = parseInt(req.query.limit);
        }

        var page = 1;

        if (req.query.page)
        {
            page = parseInt(req.query.page);
        }
        
        var skip = (page - 1) * limit;

        var sort = {};

        updateaccessstats(req);
        
        var message = [];

        (async () => {
        
            var mclient = await qdbapi.connect();
            qdbapi.setClient(mclient);
            message = await qdbapi.findDocuments('addresses', {}, limit, sort, skip);

            await qdbapi.close();
            
            res.json(message);
        
        })();
                
    });

router.route('/address/:addr')
    .get(function(req, res) {

        var addr = req.params.addr;

        updateaccessstats(req);
        
        var message = [];

        (async () => {
        
            var mclient = await qdbapi.connect();
            qdbapi.setClient(mclient);
            message = await qdbapi.findDocuments('addresses', {"address": addr});

            await qdbapi.close();
            
            res.json(message);
        
        })();
                
    });

router.route('/addressesByTokenId/:tokenid')
    .get(function(req, res) {

        var tokenid = req.params.tokenid;

        var limit = 100;

        if (req.query.limit)
        {
            limit = parseInt(req.query.limit);
        }

        var page = 1;

        if (req.query.page)
        {
            page = parseInt(req.query.page);
        }
        
        var skip = (page - 1) * limit;

        var sort = {};

        updateaccessstats(req);
        
        var message = [];

        (async () => {
        
            var mclient = await qdbapi.connect();
            qdbapi.setClient(mclient);
            message = await qdbapi.findDocuments('addresses', {"tokenIdHex": tokenid}, limit, sort, skip);

            await qdbapi.close();
            
            res.json(message);
        
        })();
                
    });
    
router.route('/balance/:tokenid/:address')
    .get(function(req, res) {

        var addr = req.params.address;
        var tokenid = req.params.tokenid;
        
        updateaccessstats(req);
        
        var message = {};

        (async () => {
        
            var mclient = await qdbapi.connect();
            qdbapi.setClient(mclient);

            var rawRecordId = addr + '.' + tokenid;
            var recordId = crypto.createHash('md5').update(rawRecordId).digest('hex');
            
            message = await qdbapi.findDocument('addresses', {"recordId": recordId});

            await qdbapi.close();
            
            if (message && message.tokenBalance)
            {
            
                var humanbal = new Big(message.tokenBalance).div(Big(10).pow(message.tokenDecimals)).toFixed(message.tokenDecimals);
                res.json(humanbal);
                
            }
            else
            {
            
                res.json("0");
            
            }
        
        })();
                
    });

router.route('/transactions')
    .get(function(req, res) {

        var limit = 100;

        if (req.query.limit)
        {
            limit = parseInt(req.query.limit);
        }

        var page = 1;

        if (req.query.page)
        {
            page = parseInt(req.query.page);
        }
        
        var skip = (page - 1) * limit;

        var sort = {"transactionDetails.timestamp_unix":-1};
        
        updateaccessstats(req);
        
        var message = [];

        (async () => {
        
            var mclient = await qdbapi.connect();
            qdbapi.setClient(mclient);
            message = await qdbapi.findDocuments('transactions', {}, limit, sort, skip);

            await qdbapi.close();
            
            res.json(message);
        
        })();
                
    });

router.route('/transaction/:txid')
    .get(function(req, res) {

        var txid = req.params.txid;

        updateaccessstats(req);
        
        var message = [];

        (async () => {
        
            var mclient = await qdbapi.connect();
            qdbapi.setClient(mclient);
            message = await qdbapi.findDocuments('transactions', {"txid": txid});

            await qdbapi.close();
            
            res.json(message);
        
        })();
                
    });
    
router.route('/transactions/:tokenid')
    .get(function(req, res) {

        var tokenid = req.params.tokenid;

        var limit = 100;

        if (req.query.limit)
        {
            limit = parseInt(req.query.limit);
        }

        var page = 1;

        if (req.query.page)
        {
            page = parseInt(req.query.page);
        }
        
        var skip = (page - 1) * limit;

        var sort = {"transactionDetails.timestamp_unix":-1};

        updateaccessstats(req);
        
        var message = [];

        (async () => {
        
            var mclient = await qdbapi.connect();
            qdbapi.setClient(mclient);
            
            var mquery = {"transactionDetails.tokenIdHex":tokenid};
            
            message = await qdbapi.findDocuments('transactions', mquery, limit, sort, skip);

            await qdbapi.close();
            
            res.json(message);
        
        })();
                
    });
    
router.route('/transactions/:tokenid/:address')
    .get(function(req, res) {

        var tokenid = req.params.tokenid;
        var address = req.params.address;

        var limit = 100;

        if (req.query.limit)
        {
            limit = parseInt(req.query.limit);
        }

        var page = 1;

        if (req.query.page)
        {
            page = parseInt(req.query.page);
        }
        
        var skip = (page - 1) * limit;

        var sort = {"transactionDetails.timestamp_unix":-1};
        
        updateaccessstats(req);
        
        var message = [];

        (async () => {
        
            var mclient = await qdbapi.connect();
            qdbapi.setClient(mclient);
            
            var mquery = {
                $and : 
                [
                    { 
                        $or : 
                        [ 
                            {"transactionDetails.senderAddress" : address},
                            {"transactionDetails.sendOutput.address": address}
                       ]
                    },
                    { 
                        "transactionDetails.tokenIdHex":tokenid
                    }
                ]
            };
            
            message = await qdbapi.findDocuments('transactions', mquery, limit, sort, skip);

            await qdbapi.close();
            
            res.json(message);
        
        })();
                
    });
    

router.route('/tokensByOwner/:owner')
    .get(function(req, res) {
    
        var ownerId = req.params.owner;

        var limit = 100;

        if (req.query.limit)
        {
            limit = parseInt(req.query.limit);
        }

        var page = 1;

        if (req.query.page)
        {
            page = parseInt(req.query.page);
        }
        
        var skip = (page - 1) * limit;

        var sort = {};
        
        updateaccessstats(req);
        
        var message = [];

        (async () => {
        
            var mclient = await qdbapi.connect();
            qdbapi.setClient(mclient);
            message = await qdbapi.findDocuments('tokens', {"tokenDetails.ownerAddress": ownerId}, limit, sort, skip);

            await qdbapi.close();
            
            res.json(message);
        
        })();
        
    });

    
router.route('/newblocknotify')
    .post(function(req, res) {

        const authorization = req.headers["authorization"];

        // This will be authorization + verification
        const token = authorization + webhookVerification;

        // Make sure we block access if the token is invalid...
        if (token !== webhookToken) {
            return res.status(401).send("Unauthorized!");
        }
	
        updateaccessstats(req);
        
        newblocknotify();

        var message = {status: 'success'};

        res.json(message);
        
    });
    
router.route('/peerinfo')
    .get(function(req, res) {

        updateaccessstats(req);
        
        var thisPeer = myIPAddress + ":" + port;
        
        var message = {goodPeers: goodPeers, badPeers: badPeers, unvalidatedPeers: unvalidatedPeers, thisPeer: thisPeer};

        res.json(message);
        
    });
    
router.route('/getheight')
    .get(function(req, res) {
    
        updateaccessstats(req);
        
        rclient.get('qae_lastscanblock', function(err, reply)
        {
    
            if (err)
            {
                console.log(err);
                var message = {error: 'Height not available'};
            }
            else if (reply == null || parseInt(reply) != reply)
            {

                var message = {height: parseInt(reply)};
                
            }

            res.json(message);
            
        });
        
    });
    
router.route('/getRingSignature/:height')
    .get(function(req, res) {
    
        var height = parseInt(req.params.height);

        updateaccessstats(req);
        
        var message = {};

        rclient.hget('qae_ringsignatures', height, function(err, reply)
        {
            
            if (reply)
            {
            
                var ringsignature = crypto.createHash('sha256').update(myIPAddress + reply).digest('hex');

                message = {ip: myIPAddress, port: parseInt(port), height: height, ringsignature: ringsignature}; //, debug: reply};
            
                res.json(message);
            
            }
            else
            {

                var ringsignature = crypto.createHash('sha256').update(myIPAddress + reply).digest('hex');

                message = {ip: myIPAddress, port: parseInt(port), height: height, ringsignature: '', error: 'Signature Not Found'};
            
                res.json(message);
            
            }
            
        });
        
    });
    
router.route('/getRingSignature/:height/:callerport')
    .get(function(req, res) {
    
        var height = parseInt(req.params.height);
        var callerport = parseInt(req.params.callerport);

        updateaccessstats(req);
        
        var message = {};

        rclient.hget('qae_ringsignatures', height, function(err, reply)
        {
            
            if (reply)
            {
            
                var ringsignature = crypto.createHash('sha256').update(myIPAddress + reply).digest('hex');

                message = {ip: myIPAddress, port: parseInt(port), height: height, ringsignature: ringsignature};
            
                res.json(message);
            
            }
            else
            {

                var ringsignature = crypto.createHash('sha256').update(myIPAddress + reply).digest('hex');

                message = {ip: myIPAddress, port: parseInt(port), height: height, ringsignature: '', error: 'Signature Not Found'};
            
                res.json(message);
            
            }
            
        });
        
        var callerip = getCallerIP(req).toString();
        
        if (!goodPeers[callerip + ":" + callerport] && !unvalidatedPeers[callerip + ":" + callerport])
        {
            unvalidatedPeers[callerip + ":" + callerport] = {ip: callerip, port: parseInt(callerport)};
        }
        
    });
    
/////
// Catch any unmatching routes
/////    
    
router.route('*')
    .get(function(req, res) {
    
        var message = {error: {code: 402, message: 'Method not found', description: 'Check the API documentation to ensure you are calling your method properly.'}};
        res.status(400).json(message);

    })
    
    
// REGISTER OUR ROUTES
// all of our routes will be prefixed with /api
app.use('/api', router);

// Failsafe
var interval = setInterval(function() {

    var currentIntervalTime = Math.floor(new Date() / 1000);
    if (lastBlockNotify < (currentIntervalTime - iniconfig.polling_interval))
    {
        newblocknotify();
    }
  
}, iniconfig.polling_interval * 1000);


var intervalpeers = setInterval(function() {

    testPeers();
  
}, 60000);

function initialize()
{

    // Check Database
    rclient.get('qae_lastscanblock', function(err, reply)
    {
    
        if (err)
        {
            console.log(err);
        }
        /*
        else if (reply == null || parseInt(reply) != reply)
        {
        
            // Invalid last block.   Start over.
            (async () => {

                let response = {};
                let exists = true;
                
                var mclient = await qdb.connect();
                qdb.setClient(mclient);
                
                exists = await qdb.doesCollectionExist('tokens');
                console.log("Does collection 'tokens' Exist: " + exists);
                if (exists == true)
                {
                    console.log("Removing all documents from 'tokens'");
                    await qdb.removeDocuments('tokens', {});
                }
                else
                {
                    console.log("Creating new collection 'tokens'");
                    await qdb.createCollection('tokens', {});
                }

                exists = await qdb.doesCollectionExist('addresses');
                console.log("Does collection 'addresses' Exist: " + exists);
                if (exists == true)
                {
                    console.log("Removing all documents from 'addresses'");
                    await qdb.removeDocuments('addresses', {});
                }
                else
                {
                    console.log("Creating new collection 'addresses'");
                    await qdb.createCollection('addresses', {});
                }
                
                exists = await qdb.doesCollectionExist('transactions');
                console.log("Does collection 'transactions' Exist: " + exists);
                if (exists == true)
                {
                    console.log("Removing all documents from 'transactions'");
                    await qdb.removeDocuments('transactions', {});
                }
                else
                {
                    console.log("Creating new collection 'transactions'");
                    await qdb.createCollection('transactions', {});
                }

                await qdb.close();
                
                // START THE SERVER
                // =============================================================================
                app.listen(port);
                console.log('Magic happens on Port:' + port);

                myIPAddress = await publicIp.v4();
                        
                console.log("This IP Address is: " + myIPAddress);

                scanBlocks(true);
        
            })();
        
        }
        */
        else
        {

            (async () => {

                // START THE SERVER
                // =============================================================================
                app.listen(port);
                console.log('Magic happens on Port:' + port);

                myIPAddress = await publicIp.v4();
                        
                console.log("This IP Address is: " + myIPAddress);

                scanBlocks(false, false);
		    
				// Create Webhooks
				if (iniconfig.webhooks_enabled == 1)
				{
			
	            	console.log("Creating Webhook");
			
                    request.get(iniconfig.webhook_node + '/webhooks', {json:true}, function (error, response, body)
                    {

		        		if (body && body.data)
		        		{
			    
		    	    		var currentWebhooks = body.data;
			    
			    			currentWebhooks.forEach( (row) => { 
				
			        			if (row.target == iniconfig.qae_webhook)
			        			{
		                    		var hookId = row.id;
				    				console.log("Delete Webhook #" + hookId);
                                    request.delete(iniconfig.webhook_node + '/webhooks/' + hookId, {json:true}, function (error, response, body){});    
			        			}
			    
			    			});
			    
		        		}
                    
		        		// Create New Hook
		        		var postVars = {};
		        		postVars.event = 'block.applied';
		        		postVars.target = iniconfig.qae_webhook;
	            		postVars.conditions = [{key:'height', condition: 'gt', value: 0}];
			
		        		request.post(iniconfig.webhook_node + '/webhooks', {json:true, body: postVars, header: {Authorization: webhookToken}}, function (error, response, body){
		    
			    			console.log(body);
				
			    			webhookToken = body.data.token;
			    			webhookVerification = webhookToken.substring(32);
		    
		        		});
                                                        
                	});
			
				}
        
            })();
            
        }

    });

}

// Main Functions
// ==========================

function scanBlocks(reindex = false) //, redownload = false)
{

    if (reindex == true)
    {
        console.log("Reindex Required");
        
        (async () => {

            await qae.indexDatabase(qdb);
            
            downloadChain();

        })();
        
    }
    else
    {
    
        downloadChain();

    }

}


function downloadChain()
{

    scanLock = true;
    scanLockTimer = Math.floor(new Date() / 1000);
    
    (async () => {
            
        var pgclient = new Client({user: iniconfig.pg_username, database: iniconfig.pg_database, password: iniconfig.pg_password});
		await pgclient.connect()
		var message = await pgclient.query('SELECT * FROM blocks ORDER BY height DESC LIMIT 1')
		await pgclient.end()
            
        
        var topHeight = 0;
        if (message && message.rows && message.rows[0].height)
        {
            var topHeight = message.rows[0].height;
            lastBlockId = message.rows[0].id;
        }
        
        console.log('QAE Current Top Height #' + topHeight + '.....');

        scanLock = false;
        scanLockTimer = 0;

	    doScan();
        
    })();

}


function doScan()
{

    scanLock = true;
    scanLockTimer = Math.floor(new Date() / 1000);
    
    rclient.get('qae_lastscanblock', function(err, reply){

        if (err)
        {
            console.log(err);
        }
        else if (reply == null || parseInt(reply) != reply)
        {
            scanBlockId = 0;
        }
        else
        {
            scanBlockId = parseInt(reply);
        }
        
        //
        
        rclient.get('qae_lastblockid', function(err, replytwo){

            if (err)
            {
                console.log(err);
            }
            else if (reply == null)
            {
                lastBlockId = '';
            }
            else
            {
                lastBlockId = replytwo;
            }
        
        
            //
        
            console.log('Scanning from block #' + scanBlockId + '.....');

            (async () => {

                var currentHeight = 0;

				var pgclient = new Client({user: iniconfig.pg_username, database: iniconfig.pg_database, password: iniconfig.pg_password});
				await pgclient.connect()
				var message = await pgclient.query('SELECT * FROM blocks ORDER BY height DESC LIMIT 1');

                if (message && message.rows) currentHeight = parseInt(message.rows[0].height);
            
                console.log('Current Blockchain Height: ' + currentHeight);

                var mclient = await qdb.connect();
                qdb.setClient(mclient);
                
                await whilstScanBlocks(scanBlockId, currentHeight, pgclient, qdb);
                
                                    
            })();

        });
    
    });

}


async function whilstScanBlocks(count, max, pgclient, qdb)
{

    asyncv3.whilst(
        function test(cb) { cb(null, count < max) },
        function iter(callback) {
    
            (async () => {
    
                count++;
            
                scanLockTimer = Math.floor(new Date() / 1000);
                                        
                if (count%1000 == 0) console.log("Scanning: " + count);
                
                var message = await pgclient.query('SELECT * FROM blocks WHERE height = $1 LIMIT 1', [count]);
                            
                if (message && message.rows)
                {

                    var blockdata = message.rows[0];

                    if (blockdata && blockdata.id)
                    {

                        var blockidcode = blockdata.id;
                        var blocktranscount = blockdata.number_of_transactions;
                        var thisblockheight = blockdata.height;
                    
                        var previousblockid = blockdata.previous_block;

                        if (lastBlockId != previousblockid && thisblockheight > 1)
                        {
                    
                            console.log('Error:  Last Block ID is incorrect!  Rescan Required!');
                            
                            console.log("Expected: " + previousblockid);
                            console.log("Received: " + lastBlockId);
                            console.log("ThisBlockHeight: " + thisblockheight);
                            console.log("LastScanBlock: " + count);
                            
                            rclient.del('qae_lastblockid', function(err, reply){
                                rclient.del('qae_lastscanblock', function(err, reply){
                                    process.exit(-1);
                                });
                            });
                    
                        }

                        lastBlockId = blockidcode;
                            
                        processedItems = false;

                        if (parseInt(blocktranscount) > 0 && thisblockheight >= qaeactivationHeight)
                        {
                
			    			try {
                                var tresponse = await pgclient.query('SELECT * FROM transactions WHERE block_id = $1 ORDER BY sequence ASC', [blockidcode]);
			    			} catch (e) {
								var tresponse = null;
			    			}
                
                            if (tresponse && tresponse.rows)
                            {
                                
                                var trxcounter = 0;
                                                                
                                tresponse.rows.forEach( (origtxdata) => {
                        
                                    (async () => {
                                    
										var epochdate = new Date(Date.parse('2017-03-21 13:00:00'));
										var unixepochtime = Math.round(epochdate.getTime()/1000);
										
										var unixtimestamp = parseInt(origtxdata.timestamp) + unixepochtime;
										var humantimestamp = new Date(unixtimestamp * 1000).toISOString();
                                    
                                    	var txdata = {};
                                    	txdata.id = origtxdata.id
                                    	txdata.blockId = origtxdata.block_id;
                                    	txdata.version = origtxdata.version;
                                    	txdata.type = origtxdata.type;
                                    	txdata.amount = origtxdata.amount;
                                    	txdata.fee = origtxdata.fee;
                                    	txdata.sender = qreditjs.crypto.getAddress(origtxdata.sender_public_key);
                                    	txdata.senderPublicKey = origtxdata.sender_public_key;
                                    	txdata.recipient = origtxdata.recipient_id
                                    	if (origtxdata.vendor_field_hex != null && origtxdata.vendor_field_hex != '')
                                    	{
                                    		txdata.vendorField = hex_to_ascii(origtxdata.vendor_field_hex.toString());
                                    	}
                                    	else
                                    	{
                                    		txdata.vendorField = null;
                                    	}
                                    	txdata.confirmations = parseInt(max) - parseInt(thisblockheight);
                                    	txdata.timestamp = {epoch: origtxdata.timestamp, unix: unixtimestamp, human: humantimestamp};
                                        
                                        trxcounter++;
                        
                                        if (txdata.vendorField && txdata.vendorField != '')
                                        {

                                            var isjson = false;
                            
                                            try {
                                                JSON.parse(txdata.vendorField);
                                                isjson = true;
                                            } catch (e) {
                                                //console.log("VendorField is not JSON");
                                            }
                            
                                            if (isjson === true)
                                            {
                                            
console.log(txdata);
                                            
                                                var parsejson = JSON.parse(txdata.vendorField);
                                            
                                                if (parsejson.qae1)
                                                {
                                                    var qaeresult = await qae.parseTransaction(txdata, blockdata, qdb);
                                                        
                                                    processedItems = true;
                                                }
                                
                                            }
                            
                                        }
                                            
                                        if (trxcounter == tresponse.rows.length)
                                        {
                                            
                                            await processRingSignatures(thisblockheight, processedItems, pgclient, qdb);

                                            await setAsync('qae_lastscanblock', thisblockheight);
                                            await setAsync('qae_lastblockid', blockidcode);
                                                
                                            callback(null, count);
                                            
                                        }
                            
                                    })();
                            
                                });
                    
                            }
			    			else
			    			{
                                // This needs to be handled.  TODO:  Missing transactions when there should be some
								callback(null, count);
			    			}
				
                        }
                        else
                        {
                            
                            await processRingSignatures(thisblockheight, false, pgclient, qdb);

                            await setAsync('qae_lastscanblock', thisblockheight);
                            await setAsync('qae_lastblockid', blockidcode);

                            callback(null, count);
                                
                        }

                    }

                }
                else
                {
                
                    console.log("Block #" + count + " not found in database.. This is a fatal error...");
                    process.exit(-1);
                
                }

            })();

        },
        function (err, n) {
        
            (async () => {
            
                await qdb.close();
                await pgclient.end()
                
                scanLock = false;
                scanLockTimer = 0;
                
                var nowTime = Math.floor(new Date() / 1000);
                
                if (gotSeedPeers < nowTime - 900) // Check for seeds every 15 minutes
                {
                    gotSeedPeers = nowTime;
                    getSeedPeers();
                }
        
            })();
            
        }
        
    );


}

function processRingSignatures(thisblockheight, processedItems, pgclient, qdb)
{

    return new Promise(resolve => {

        (async () => {

            if (thisblockheight > 1)
            {
                            
                rclient.hget('qae_ringsignatures', (parseInt(thisblockheight) - 1), function(err, reply)
                {
        
                    previoushash = reply;

                    (async () => {

                        if (processedItems == true || sigblockhash == '' || sigtokenhash == '' || sigaddrhash == '' || sigtrxhash == '')
                        {               

                            // Only check if new things were processed or we have empty vars
                            
							var message = await pgclient.query('SELECT * FROM blocks WHERE height = $1 LIMIT 1', [thisblockheight]);
                                                
                            sigblockhash = message.rows[0].id;
                            sigtokenhash = await qdb.findDocumentHash('tokens', {"lastUpdatedBlock": {$lte: thisblockheight}}, "tokenDetails.tokenIdHex", {"_id":-1});
                            sigaddrhash = await qdb.findDocumentHash('addresses', {"lastUpdatedBlock": {$lte: thisblockheight}}, "recordId", {"_id":-1});
                            sigtrxhash = await qdb.findDocumentHash('transactions', {"blockHeight": {$lte: thisblockheight}}, "txid", {"_id":-1});

                        }
            
                        fullhash = crypto.createHash('sha256').update(previoushash + sigblockhash + sigtokenhash + sigaddrhash + sigtrxhash).digest('hex');
        
                        rclient.hset('qae_ringsignatures', thisblockheight, fullhash, function(err, reply)
                        {
                                
                            resolve(true);
        
                        });
        
                    })();
        
                });
                                                                                            
            }
            else
            {
            
                // First Block
                
				var message = await pgclient.query('SELECT * FROM blocks WHERE height = $1 LIMIT 1', [thisblockheight]);

                sigblockhash =  message.rows[0].id;
                sigtokenhash = await qdb.findDocumentHash('tokens', {"lastUpdatedBlock": {$lte: thisblockheight}}, "tokenDetails.tokenIdHex", {"_id":-1});
                sigaddrhash = await qdb.findDocumentHash('addresses', {"lastUpdatedBlock": {$lte: thisblockheight}}, "recordId", {"_id":-1});
                sigtrxhash = await qdb.findDocumentHash('transactions', {"blockHeight": {$lte: thisblockheight}}, "txid", {"_id":-1});
            
                fullhash = crypto.createHash('sha256').update(sigblockhash + sigtokenhash + sigaddrhash + sigtrxhash).digest('hex');

                await hsetAsync('qae_ringsignatures', thisblockheight, fullhash);
                                
                resolve(true);
                                          
            }
    
        })();
    
    });

}


function newblocknotify()
{

    lastBlockNotify = Math.floor(new Date() / 1000);
	
    console.log('New Block Notify..');

    if (scanLock == true)
    {
        // TODO:  Check if it is a stale lock
        var currentUnixTime = Math.floor(new Date() / 1000);
        if (scanLockTimer < (currentUnixTime - iniconfig.scanlock_staletime))
        {
            // force unlock
            console.log("Forcing scanlock Unlock....");
            scanLock = false;
        }
    
    
        console.log('Scanner already running...');
    }
    else
    {
        scanBlocks(false, false);
    }
    
    return true;

}

function validatePeer(peerip, peerport)
{

    peerport = parseInt(peerport);

    var peerapiurl = "http://" + peerip + ":" + peerport + "/api";
    
    rclient.get('qae_lastscanblock', function(err, reply)
    {
    
        var blockheight = parseInt(reply) - 1;
        
console.log("Validating " + peerip + ":" + peerport + " at height " + blockheight);

        rclient.hget('qae_ringsignatures', blockheight, function(err, replytwo)
        {
        
            if (replytwo)
            {
            
                // This is what the peer hash should be
            
                var ringsignature = crypto.createHash('sha256').update(peerip + replytwo).digest('hex');

console.log("RingSig should be: " + ringsignature);

                request.get(peerapiurl + '/getRingSignature/' + blockheight + '/' + port, {json:true}, function (error, response, body) 
                {
                
                    if (error)
                    {
                        // An error occurred, cannot validate
console.log(error);                  
                        delete goodPeers[peerip + ":" + peerport];
                        delete badPeers[peerip + ":" + peerport];
                        unvalidatedPeers[peerip + ":" + peerport] = {ip: peerip, port: peerport};
                        
                    }
                    else
                    {
                        if (body && !body.error && body.ringsignature)
                        {

console.log("RingSig received is: " + body.ringsignature);

                            if (body.ringsignature == ringsignature)
                            {
console.log("Ring sig validated for peer: " + peerip + ":" + peerport);
                                // Validated
                                goodPeers[peerip + ":" + peerport] = {ip: peerip, port: peerport, lastCheckHeight: blockheight};
                                delete unvalidatedPeers[peerip + ":" + peerport];
                                delete badPeers[peerip + ":" + peerport];
                                getPeers(peerip + ":" + peerport);
                            
                            }
                            else
                            {
                            
                                delete goodPeers[peerip + ":" + peerport];
                                delete unvalidatedPeers[peerip + ":" + peerport];
                                badPeers[peerip + ":" + peerport] = {ip: peerip, port: peerport, lastCheckHeight: blockheight};
                            
                            }
                        
                        }
                        else
                        {

console.log("Unable to validate at height: " + blockheight);

                            // Cannot validate
                            delete goodPeers[peerip + ":" + peerport];
                            delete badPeers[peerip + ":" + peerport];
                            unvalidatedPeers[peerip + ":" + peerport] = {ip: peerip, port: peerport};
                        
                        }
                    
                    }
        
                });
            
            }
            else
            {
console.log("We do not have this ringsig: " + blockheight);
                // Cannot validate this height
                delete goodPeers[peerip + ":" + peerport];
                delete badPeers[peerip + ":" + peerport];
                unvalidatedPeers[peerip + ":" + peerport] = {ip: peerip, port: peerport};
                            
            }
            
        });
        
    });

}

function getSeedPeers()
{

    request.get(seedNode + '/peerinfo', {json:true}, function (error, response, body) 
    {
                
        if (error)
        {
            // An error occurred, cannot get seed peer info
                        
        }
        else
        {
        
            if (body && body.goodPeers)
            {
            
                var remotePeerList = body.goodPeers;
                
                Object.keys(remotePeerList).forEach(function(k){
                
                    if (!goodPeers[k] && !badPeers[k] & !unvalidatedPeers[k])
                    {
                    
                        if (k != myIPAddress + ":" + port)
                        {
console.log("Checking peer: " + k);                        
                            unvalidatedPeers[k] = remotePeerList[k];
                            
                        }
                    
                    }
                    
                });
            
            }
            
            if (body && body.thisPeer)
            {
            
                var peerdetails = body.thisPeer.split(":");
            
                if (!goodPeers[body.thisPeer] && !badPeers[body.thisPeer] & !unvalidatedPeers[body.thisPeer])
                {
                
                    if (body.thisPeer != myIPAddress + ":" + port)
                    {
console.log("Checking peer: " + body.thisPeer);
                        unvalidatedPeers[body.thisPeer] = {ip: peerdetails[0], port: parseInt(peerdetails[1])};
                        
                    }
                    
                }
            
            }
        
        }
                
    });

}

function getPeers(peerNode)
{

    request.get(peerNode + '/peerinfo', {json:true}, function (error, response, body) 
    {
                
        if (error)
        {
            // An error occurred, cannot get seed peer info
                        
        }
        else
        {
        
            if (body && body.goodPeers)
            {
            
                var remotePeerList = body.goodPeers;
                
                Object.keys(remotePeerList).forEach(function(k){
                
                    if (!goodPeers[k] && !badPeers[k] & !unvalidatedPeers[k])
                    {
                    
                        if (k != myIPAddress + ":" + port)
                        {
                            unvalidatedPeers[k] = remotePeerList[k];
                        }

                    }
                    
                });
            
            }
            
            if (body && body.thisPeer)
            {
            
                var peerdetails = body.thisPeer.split(":");
            
                if (!goodPeers[body.thisPeer] && !badPeers[body.thisPeer] & !unvalidatedPeers[body.thisPeer])
                {
                
                    if (body.thisPeer != myIPAddress + ":" + port)
                    {
                    
                        unvalidatedPeers[body.thisPeer] = {ip: peerdetails[0], port: parseInt(peerdetails[1])};
                        
                    }
                    
                }
            
            }
        
        }
        
    });

}

function testPeers()
{

    // Test known peers
    
    Object.keys(unvalidatedPeers).forEach(function(k){
                
        var peerdetails = unvalidatedPeers[k];
        
        validatePeer(peerdetails.ip, peerdetails.port);
                    
    });
                    
    Object.keys(goodPeers).forEach(function(k){
                
        var peerdetails = goodPeers[k];
        
        validatePeer(peerdetails.ip, peerdetails.port);
                    
    });

}


// Access Statistics - Will use this later
// ==========================

function updateaccessstats(req) {

    var ip = getCallerIP(req).toString();
    
    if(accessstats[ip])
    {
        accessstats[ip] = accessstats[ip] + 1;
    }
    else
    {
        accessstats[ip] = 1;
    }

}

// Helpers
// ==========================

function hex_to_ascii(str1)
 {
	var hex  = str1.toString();
	var str = '';
	for (var n = 0; n < hex.length; n += 2) {
		str += String.fromCharCode(parseInt(hex.substr(n, 2), 16));
	}
	return str;
 }
 
function getCallerIP(request) 
{
    var ip = request.connection.remoteAddress ||
        request.socket.remoteAddress ||
        request.connection.socket.remoteAddress;
    ip = ip.split(',')[0];
    ip = ip.split(':').slice(-1); //in case the ip returned in a format: "::ffff:146.xxx.xxx.xxx"
    return ip;
}

function decimalPlaces(num) 
{
  var match = (''+num).match(/(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
  if (!match) { return 0; }
  return Math.max(
       0,
       // Number of digits right of decimal point.
       (match[1] ? match[1].length : 0)
       // Adjust for scientific notation.
       - (match[2] ? +match[2] : 0));
}

function truncateToDecimals(num, dec = 2) 
{
  const calcDec = Math.pow(10, dec);
  
  var bignum = new Big(num);
  var multiplied = parseInt(bignum.times(calcDec));
  var newbig = new Big(multiplied);
  var returnval = newbig.div(calcDec);

  return returnval.toFixed(dec);
}

function error_handle(error, caller = 'unknown', severity = 'error')
{

    var scriptname = 'qaeApi.js';

    console.log("Error Handle has been called!");

    let transporter = nodemailer.createTransport({
        sendmail: true,
        newline: 'unix',
        path: '/usr/sbin/sendmail'
    });
    transporter.sendMail({
        from: iniconfig.error_from_email,
        to: iniconfig.error_to_email,
        subject: 'OhNo! Error in ' + scriptname + ' at ' + caller,
        text: 'OhNo! Error in ' + scriptname + ' at ' + caller + '\n\n' + JSON.stringify(error)
    }, (err, info) => {
        console.log(err);
        console.log(info);
    });

}
    
