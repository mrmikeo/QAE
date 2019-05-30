/*
*
* QAE - Version 0.0.1
*
* Qredit Always Evolving
*
*/

const express    = require('express');        	// call express
const app        = express();                 	// define our app using express
const bodyParser = require('body-parser');		// for post calls
const cors 		 = require('cors');				// Cross Origin stuff
const redis 	 = require('redis');			// a really fast nosql keystore
const fs 		 = require('fs');				// so we can read the config ini file from disk
const ini 		 = require('ini');				// so we can parse the ini files properties
//const auth 		 = require('basic-auth');	// unsure if this will be used yet
const Big 		 = require('big.js');			// required unless you want floating point math issues
const nodemailer = require('nodemailer');		// for sending error reports about this node
const crypto 	 = require('crypto');			// for creating hashes of things
//const http 		 = require('http');			// no longer needed
const publicIp   = require('public-ip');		// a helper to find out what our external IP is.   Needed for generating proper ring signatures

// API Library
const qreditApi = require("./lib/qreditApi");
const qapi = new qreditApi.default();

var iniconfig = ini.parse(fs.readFileSync('/etc/qslt/qslt.ini', 'utf-8'))

// Connection URL
const mongoconnecturl = iniconfig.mongo_connection_string;
const mongodatabase = iniconfig.mongo_database;

// MongoDB Library
const qsltDB = require("./lib/qsltDB");
const qdb = new qsltDB.default(mongoconnecturl, mongodatabase);

// Connect to Redis
const rclient = redis.createClient(iniconfig.redis_port, iniconfig.redis_host,{detect_buffers: true});

// QAE-1 Token Schema
const qaeSchema = require("./lib/qaeSchema");
const qae = new qaeSchema.default();

// Declaring defaults
var myIPAddress = '';
var goodPeers = [];
var badPeers = [];

// Let us know when we connect or have an error with redis
rclient.on('connect', function() {
    console.log('Connected to Redis');
});

rclient.on('error',function() {
	console.log("Error in Redis");
	error_handle("Error in Redis", 'redisConnection');
});



// for debug testing only
//rclient.del('qslt_lastscanblock', function(err, reply){});
//rclient.del('qslt_lastblockid', function(err, reply){});
//rclient.set('qslt_lastscanblock', 3015912, function(err, reply){});
//rclient.set('qslt_lastblockid', 'be7429ac221a3d740b5ffbb232825ff17601e3a80df12cebf7e9e9e8d998532a', function(err, reply){});


// configure app to use bodyParser()
// this will let us get the data from a POST
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cors());

var port = iniconfig.api_port;

// We will keep in memory the ips that connect to us
var accessstats = [];

var scanLock = false;

// ROUTES FOR OUR API
// =============================================================================

// get an instance of the express Router
var router = express.Router();              

// a test route to make sure everything is working (accessed at GET http://ip:port/api)
router.get('/', function(req, res) {
    res.json({ message: 'Qredit Always Evolving....  Please see our API documentation' });   
});

// ToDo: Remove
router.route('/test')
    .get(function(req, res) {
    
		(async () => {

    		var response = {};

			response.apiurl = await qapi.getApiUrl();
			
	        res.json(response);
        
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
		//	sort = req.query.sort;
		//}

		updateaccessstats(req);
		
		var message = [];

		(async () => {
		
			var mclient = await qdb.connect();
			qdb.setClient(mclient);
			message = await qdb.findDocuments('tokens', {}, limit, sort, skip);

			await qdb.close();
			
        	res.json(message);
        
        })();
		
    });

router.route('/token/:id')
    .get(function(req, res) {

		var tokenid = req.params.id;
		
		updateaccessstats(req);
		
		var message = [];

		(async () => {
		
			var mclient = await qdb.connect();
			qdb.setClient(mclient);
			message = await qdb.findDocuments('tokens', {'tokenDetails.tokenIdHex': tokenid});

			await qdb.close();
			
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
		
			var mclient = await qdb.connect();
			qdb.setClient(mclient);
			message = await qdb.findDocuments('addresses', {}, limit, sort, skip);

			await qdb.close();
			
        	res.json(message);
        
        })();
        		
    });

router.route('/address/:addr')
    .get(function(req, res) {

		var addr = req.params.addr;

		updateaccessstats(req);
		
		var message = [];

		(async () => {
		
			var mclient = await qdb.connect();
			qdb.setClient(mclient);
			message = await qdb.findDocuments('addresses', {"address": addr});

			await qdb.close();
			
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
		
			var mclient = await qdb.connect();
			qdb.setClient(mclient);
			message = await qdb.findDocuments('addresses', {"tokenIdHex": tokenid}, limit, sort, skip);

			await qdb.close();
			
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
		
			var mclient = await qdb.connect();
			qdb.setClient(mclient);

			var rawRecordId = addr + '.' + tokenid;
			var recordId = crypto.createHash('md5').update(rawRecordId).digest('hex');
			
			message = await qdb.findDocument('addresses', {"recordId": recordId});

			await qdb.close();
			
			if (message.tokenBalance)
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
		
			var mclient = await qdb.connect();
			qdb.setClient(mclient);
			message = await qdb.findDocuments('transactions', {}, limit, sort, skip);

			await qdb.close();
			
        	res.json(message);
        
        })();
        		
    });

router.route('/transaction/:txid')
    .get(function(req, res) {

		var txid = req.params.txid;

		updateaccessstats(req);
		
		var message = [];

		(async () => {
		
			var mclient = await qdb.connect();
			qdb.setClient(mclient);
			message = await qdb.findDocuments('transactions', {"txid": txid});

			await qdb.close();
			
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
		
			var mclient = await qdb.connect();
			qdb.setClient(mclient);
			
			var mquery = {"transactionDetails.tokenIdHex":tokenid};
			
			message = await qdb.findDocuments('transactions', mquery, limit, sort, skip);

			await qdb.close();
			
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
		
			var mclient = await qdb.connect();
			qdb.setClient(mclient);
			
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
			
			message = await qdb.findDocuments('transactions', mquery, limit, sort, skip);

			await qdb.close();
			
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
		
			var mclient = await qdb.connect();
			qdb.setClient(mclient);
			message = await qdb.findDocuments('tokens', {"tokenDetails.ownerAddress": ownerId}, limit, sort, skip);

			await qdb.close();
			
        	res.json(message);
        
        })();
		
    });

router.route('/newblocknotify')
    .get(function(req, res) {
    
    	updateaccessstats(req);
    	
    	newblocknotify();

		var message = {status: 'success'};

        res.json(message);
    	
    });
    
router.route('/peerinfo')
    .get(function(req, res) {
    
    	updateaccessstats(req);
    	
		var message = {peers: goodPeers};

        res.json(message);
    	
    });
    
    
router.route('/getRingSignature/:height')
    .get(function(req, res) {
    
    	var keyId = req.params.key;

		updateaccessstats(req);
		
		var message = [];

		(async () => {
		
		// Some notes for this
		// Return values
		//   IP = this api ip
		//   Port = this api port
		//	 Height = block height of the check
		//   BlockHash = hash of (IP + hash of 10 block ids from this height and lower)
		//   TokenHash = hash of (IP + hash of 10 most recent created/updated token ids from this height and lower)
		//	 TransactionHash = hash of (IP + hash of 10 most recent qae transaction ids from this height and lower)
		//	 AddressHash = hash of (IP + hash of 10 most recent updates of address record ids from this height and lower)
		
		// The other machine verifies or rejects by using the same hashing method using the other machines ip.   the hash of the token information is not exposed, only after hashing it with ip is it exposed.
		
		
		/*
			var mclient = await qdb.connect();
			qdb.setClient(mclient);
			message = await qdb.findDocuments('tokens', {"tokenDetails.ownerAddress": ownerId});

			await qdb.close();
			
        	res.json(message);
        */
        
        })();
		
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
	rclient.get('qslt_lastscanblock', function(err, reply)
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
				
				
				var redownload = false;
				
				exists = await qdb.doesCollectionExist('blocks');
				if (exists != true)
				{
				
					redownload = true;
				
				}

				await qdb.close();
				
				// START THE SERVER
				// =============================================================================
				app.listen(port);
				console.log('Magic happens on Port:' + port);


				myIPAddress = await publicIp.v4();
						
				console.log("This IP Address is: " + myIPAddress);

				scanBlocks(true, redownload);
				
        
			})();
		
		}
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
		
			})();
			
		}

	});

}

// Main Functions
// ==========================

function scanBlocks(reindex = false, redownload = false)
{

	if (reindex == true)
	{
		console.log("Reindex Required");
		
		(async () => {

			await qae.indexDatabase(qdb);
			
			downloadChain(redownload);

		})();
		
	}
	else
	{
	
		downloadChain(redownload);

	}

}


function downloadChain(redownload = false)
{

	scanLock = true;
	
	(async () => {

		if (redownload == false)
		{

			var mclient = await qdb.connect();
			qdb.setClient(mclient);
			message = await qdb.findDocuments('blocks', {}, 1, {"height":-1}, 0);

			await qdb.close();	
    	
    		var topHeight = 0;
    		if (message[0] && message[0].height)
    		{
    			var topHeight = message[0].height;
    			lastBlockId = message[0].id;
			}
		
		}
		else
		{
		
			var mclient = await qdb.connect();
			qdb.setClient(mclient);

			exists = await qdb.doesCollectionExist('blocks');
			console.log("Does collection 'blocks' Exist: " + exists);
			if (exists == true)
			{
				console.log("Removing all documents from 'blocks'");
				response = await qdb.removeDocuments('blocks', {});
				//console.log(response);
			}
			else
			{
				console.log("Creating new collection 'blocks'");
				response = await qdb.createCollection('blocks', {});
				//console.log(response);
			}
	
			response = await qdb.createIndex('blocks', {"id": 1}, true);
			response = await qdb.createIndex('blocks', {"height": 1}, false);

			topHeight = 0;
			
			await qdb.close();
		
		}
		
		console.log('Downloading chain from block #' + topHeight + '.....');
		
		var scanBlockId = topHeight + 1;

		var currentHeight = await qapi.getBlockHeight();
    	 
		console.log('Current Blockchain Height: ' + currentHeight);
				
		var pagecount = 0;
		var resultcount = 100;
		
		var mclient = await qdb.connect();
		qdb.setClient(mclient);		
		
		while (resultcount > 0)
		{
		
			pagecount++;
		
			var bresponse = await qapi.searchBlocks(pagecount, 100, {"height": {"from": scanBlockId, "to": currentHeight }});

//console.log(bresponse);

			resultcount = parseInt(bresponse.meta.count);
			
			if (resultcount > 0)
			{

console.log("Downloading from " + parseInt(scanBlockId) + " Page " + pagecount);

				var blocks = bresponse.data;

				blocks.forEach(function(item) {
				
					(async () => {
				
						if (item.height > topHeight) topHeight = item.height;
		
						await qdb.insertDocuments('blocks', item);
					
					})();
		
				});
			
			}
						
		}
		
		await qdb.close();

		scanLock = false;
		
		doScan();
        
	})();

}


function doScan()
{

	scanLock = true;
	var scanBlockId = 0;
	var lastBlockId = '';
	
	
	rclient.get('qslt_lastscanblock', function(err, reply){

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
		
	rclient.get('qslt_lastblockid', function(err, replytwo){

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
    	 		
			var mclient = await qdb.connect();
			qdb.setClient(mclient);
			message = await qdb.findDocuments('blocks', {}, 1, {"height":-1}, 0);			
			
			if (message && message[0].height) currentHeight = message[0].height;
			
			console.log('Current Blockchain Height: ' + currentHeight);

			while (parseInt(scanBlockId) < parseInt(currentHeight))
			{
				scanBlockId++;
						
				if (scanBlockId%1000 == 0) console.log("Scanning: " + scanBlockId);
			
				message = await qdb.findDocument('blocks', {"height": scanBlockId});
				
				if (message)
				{

					var blockdata = message;

					if (blockdata && blockdata.id)
					{

						var blockidcode = blockdata.id;
						var blocktranscount = blockdata.transactions;
						var thisblockheight = blockdata.height;
					
						var previousblockid = blockdata.previous;

						//console.log(previousblockid + ":" + thisblockheight + ':' + blockidcode);

						if (lastBlockId != previousblockid && thisblockheight > 1)
						{
					
							console.log('Error:  Last Block ID is incorrect!  Rescan Required!');
							
							console.log("Expected: " + previousblockid);
							console.log("Received: " + lastBlockId);
							console.log("ThisBlockHeight: " + thisblockheight);
							console.log("LastScanBlock: " + scanBlockId);
							
							rclient.del('qslt_lastblockid', function(err, reply){
								rclient.del('qslt_lastscanblock', function(err, reply){
									process.exit(-1);
								});
							});
					
						}

						lastBlockId = blockidcode;

						if (parseInt(blocktranscount) > 0)
						{
				
							var tresponse = await qapi.getTransactionsByBlockID(blockidcode);
				
							if (tresponse.data)
							{
				
								tresponse.data.forEach( (txdata) => {
						
									(async () => {
						
										if (txdata.vendorField && txdata.vendorField != '')
										{
							
											//console.log("txid:" + txdata.id);
											//console.log("vend:" + txdata.vendorField);
								
											var isjson = false;
							
											try {
												JSON.parse(txdata.vendorField);
												isjson = true;
											} catch (e) {
												//console.log("VendorField is not JSON");
											}
							
											if (isjson === true)
											{
												var parsejson = JSON.parse(txdata.vendorField);
											
												if (parsejson.qae1)
												{
													var qaeresult = await qae.parseTransaction(txdata, blockdata, qdb);
												}
								
											}
							
										}
							
									})();
							
								});
					
							}
					
						}
				
						rclient.set('qslt_lastscanblock', thisblockheight, function(err, reply){});
						rclient.set('qslt_lastblockid', blockidcode, function(err, reply){});
					
					}

				}
				else
				{
				
					console.log("Block #" + scanBlockId + " not found in database.. Removing any blocks above this height...");
					
					response = await qdb.removeDocuments('blocks', {"height": {"$gt": scanBlockId}});
					
					console.log("Removed " + response.result.n + " blocks from db.  Start this program again");
					
					process.exit(-1);
				
				}

			}
			
			await qdb.close();
				
			scanLock = false;
        
		})();
	

	});
	
	
	});
	

}

function newblocknotify()
{

	console.log('New Block Notify..');

	if (scanLock == true)
	{
		console.log('Scanner already running...');
	}
	else
	{
		scanBlocks(false, false);
	}
	
	return true;

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
    