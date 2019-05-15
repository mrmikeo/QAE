/*
*
* QSLT - Version 0.0.1
*
*/

const express    = require('express');        // call express
const app        = express();                 // define our app using express
const bodyParser = require('body-parser');
const cors 		 = require('cors');
const redis 	 = require('redis');
const fs 		 = require('fs');
const ini 		 = require('ini');
const auth 		 = require('basic-auth');
const Big 		 = require('big.js');
const uuidv4 	 = require('uuid/v4');
const crypto 	 = require('crypto');
//const request 	 = require('request');
const nodemailer = require('nodemailer');
//const MongoClient = require('mongodb').MongoClient;
//const assert 	 = require('assert');

const qreditApi = require("./lib/qreditApi");
const qapi = new qreditApi.default();

var iniconfig = ini.parse(fs.readFileSync('/etc/qslt/qslt.ini', 'utf-8'))

// Connection URL
const mongoconnecturl = iniconfig.mongo_connection_string;
const mongodatabase = iniconfig.mongo_database;

const qsltDB = require("./lib/qsltDB");
const qdb = new qsltDB.default(mongoconnecturl, mongodatabase);

const rclient = redis.createClient(iniconfig.redis_port, iniconfig.redis_host,{detect_buffers: true});

// QAE-1 Tokens
const qaeSchema = require("./lib/qaeSchema");
const qae = new qaeSchema.default();

// for testing
console.log(qae.getTransactionTypes());


rclient.on('connect', function() {
    console.log('Connected to Redis');
});

rclient.on('error',function() {
	console.log("Error in Redis");
	error_handle("Error in Redis", 'redisConnection');
});

// configure app to use bodyParser()
// this will let us get the data from a POST
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cors());

var port = iniconfig.api_port;        // set our port

var accessstats = [];

var scanLock = false;

// ROUTES FOR OUR API
// =============================================================================
var router = express.Router();              // get an instance of the express Router

// test route to make sure everything is working (accessed at GET http://localhost:8080/api)
router.get('/', function(req, res) {
    res.json({ message: 'hooray! welcome to our api!' });   
});

router.route('/test')
    .get(function(req, res) {
    
		(async () => {

    		var response = {};

			response.apiurl = await qapi.getApiUrl();
			//response.blockchain = await qapi.getBlockChain();
			response.blockchain = await qapi.listBlocks();
			
	        res.json(response);
        
		})();

    });
    
router.route('/tokens')
    .get(function(req, res) {

		updateaccessstats(req);
		
		var message = [];

        res.json(message);
		
    });

router.route('/addresses')
    .get(function(req, res) {

		updateaccessstats(req);
		
		var message = [];

        res.json(message);
		
    });

router.route('/transactions')
    .get(function(req, res) {

		updateaccessstats(req);
		
		var message = [];

        res.json(message);
		
    });
    
router.route('/newblocknotify')
    .get(function(req, res) {
    
    	updateaccessstats(req);
    	
    	newblocknotify();

		var message = {status: 'success'};

        res.json(message);
    	
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


initialize();

// Check every 30 seconds 
var interval = setInterval(function() {

	newblocknotify();
  
}, 30000);


function initialize()
{

	// Check Database
	rclient.get('qslt_lastblock', function(err, reply)
	{
	
		if (err)
		{
			console.log(err);
		}
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
					response = await qdb.removeDocuments('tokens', {});
					//console.log(response);
				}
				else
				{
					console.log("Creating new collection 'tokens'");
					response = await qdb.createCollection('tokens', {});
					//console.log(response);
				}

				exists = await qdb.doesCollectionExist('addresses');
				console.log("Does collection 'addresses' Exist: " + exists);
				if (exists == true)
				{
					console.log("Removing all documents from 'addresses'");
					response = await qdb.removeDocuments('addresses', {});
					//console.log(response);
				}
				else
				{
					console.log("Creating new collection 'addresses'");
					response = await qdb.createCollection('addresses', {});
					//console.log(response);
				}
				
				exists = await qdb.doesCollectionExist('transactions');
				console.log("Does collection 'transactions' Exist: " + exists);
				if (exists == true)
				{
					console.log("Removing all documents from 'transactions'");
					response = await qdb.removeDocuments('transactions', {});
					//console.log(response);
				}
				else
				{
					console.log("Creating new collection 'transactions'");
					response = await qdb.createCollection('transactions', {});
					//console.log(response);
				}
				
				await qdb.close();
				
				// START THE SERVER
				// =============================================================================
				app.listen(port);
				console.log('Magic happens on Port:' + port);
				
				scanFromBlock(iniconfig.initial_height, true);
        
			})();
		
		}
		else
		{

			// START THE SERVER
			// =============================================================================
			app.listen(port);
			console.log('Magic happens on Port:' + port);
			
			scanFromBlock(parseInt(reply), false);
			
		}

	});

}

// Main Functions
// ==========================

function scanFromBlock(blockheight, reindex)
{

	if (reindex == true)
	{
		console.log("Reindex Required");
		
		(async () => {


			/* TODO:  Move this to qaeSchema */

			var mclient = await qdb.connect();
			qdb.setClient(mclient);
				
			response = await qdb.createIndex('tokens', {"tokenDetails.tokenIdHex": 1}, true);
			response = await qdb.createIndex('tokens', {"tokenDetails.symbol": 1}, false);
			response = await qdb.createIndex('tokens', {"tokenDetails.name": 1}, false);
			response = await qdb.createIndex('tokens', {"tokenDetails.transactionType": 1}, false);
			response = await qdb.createIndex('tokens', {"type": 1}, false);

			response = await qdb.createIndex('addresses', {"recordId": 1}, true);
			response = await qdb.createIndex('addresses', {"address": 1}, false);
			response = await qdb.createIndex('addresses', {"tokenIdHex": 1}, false);
			response = await qdb.createIndex('addresses', {"isOwner": 1}, false);
			
			response = await qdb.createIndex('transactions', {"txid": 1}, true);
			response = await qdb.createIndex('transactions', {"blockId": 1}, false);
			response = await qdb.createIndex('transactions', {"blockHeight": 1}, false);
			response = await qdb.createIndex('transactions', {"tokenDetails.senderAddress": 1}, false);
			response = await qdb.createIndex('transactions', {"tokenDetails.tokenIdHex": 1}, false);
			response = await qdb.createIndex('transactions', {"tokenDetails.transactionType": 1}, false);
			response = await qdb.createIndex('transactions', {"tokenDetails.sendOutput.address": 1}, false);

			await qdb.close();
			
			doScan(blockheight);

		})();
		
	}
	else
	{
	
		doScan(blockheight);

	}

}

function doScan(blockheight)
{

	scanLock = true;
	
	var scanBlockId = blockheight;

	console.log('Scanning from block #' + blockheight + '.....');

	(async () => {

		var currentHeight = await qapi.getBlockHeight();
    	 
		console.log('Current Blockchain Height: ' + currentHeight);

		while (parseInt(scanBlockId) <= parseInt(currentHeight))
		{
			scanBlockId++;
			
			var bresponse = await qapi.getBlockByHeight(scanBlockId);
	
			if (bresponse.data)
			{

				var blockdata = bresponse.data[0];

				if (blockdata && blockdata.id)
				{

					var blockidcode = blockdata.id;
					var blocktranscount = blockdata.transactions;
					var thisblockheight = blockdata.height;
			
					console.log(thisblockheight + ':' + blockidcode);

					if (blocktranscount > 0)
					{
				
						var tresponse = await qapi.getTransactionsByBlockID(blockidcode);
				
						if (tresponse.data)
						{
				
							tresponse.data.forEach( (txdata) => {
						
								(async () => {
						
									if (txdata.vendorField && txdata.vendorField != '')
									{
							
										console.log("txid:" + txdata.id);
										console.log("vend:" + txdata.vendorField);
								
										var isjson = false;
							
										try {
											JSON.parse(x);
											isjson = true;
										} catch (e) {
											console.log("VendorField is not JSON");
										}
							
										if (isjson === true)
										{
								
											await qae.parseTransaction(txdata);
								
										}
							
									}
							
								})();
							
							});
					
						}
					
					}
				
					rclient.set('qslt_lastblock', thisblockheight, function(err, reply){});

				}

			}
			

		}
		
		scanLock = false;
        
	})();

}

function newblocknotify()
{

	console.log('New Block Notify..');
	
	rclient.get('qslt_lastblock', function(err, reply)
	{
	
		if (err)
		{
			console.log(err);
		}
		else if (reply == null || parseInt(reply) != reply)
		{
		
			if (scanLock == true)
			{
				console.log('Scanner already running...');
			}
			else
			{
				scanFromBlock(iniconfig.initial_height, false);
			}
		
		}
		else
		{

			if (scanLock == true)
			{
				console.log('Scanner already running...');
			}
			else
			{
				scanFromBlock(parseInt(reply), false);
			}
		
		}
		
	});

}

// Access Statistics
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

function getCallerIP(request) 
{
    var ip = request.headers['x-forwarded-for'] ||
        request.connection.remoteAddress ||
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

	var scriptname = 'qsltApi.js';

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
    