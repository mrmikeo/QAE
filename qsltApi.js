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
//const auth 		 = require('basic-auth');
const Big 		 = require('big.js');
const nodemailer = require('nodemailer');
const crypto 	 = require('crypto');


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


// for testing
rclient.del('qslt_lastblock', function(err, reply){});
//rclient.set('qslt_lastblock', 2967100, function(err, reply){});


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
			response.blockchain = await qapi.listBlocks();
			
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
		//	sort = parseInt(req.query.sort);
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
    
router.route('/getRingSignature/:height')
    .get(function(req, res) {
    
    	var keyId = req.params.key;

		updateaccessstats(req);
		
		var message = [];

		(async () => {
		
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
  
}, 10000);


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

			await qae.indexDatabase(qdb);
			
			doSuperScan(blockheight);

		})();
		
	}
	else
	{
	
		doScan(blockheight);

	}

}


function doSuperScan(blockheight)
{

	scanLock = true;
	
	var scanBlockId = blockheight;

	console.log('SUPER Scanning from block #' + blockheight + '.....');

	(async () => {

		var currentHeight = await qapi.getBlockHeight();
    	 
		console.log('Current Blockchain Height: ' + currentHeight);
		
		var checkingblocks = [];
		
		var pagecount = 0;
		var resultcount = 100;
		while (resultcount > 0)
		{
		
			pagecount++;
		
			var bresponse = await qapi.searchBlocks(pagecount, 100, {"height": {"from": scanBlockId, "to": currentHeight }, "numberOfTransactions": {"from": 1}});

//console.log(bresponse.meta);

			resultcount = parseInt(bresponse.meta.count);

			var blocks = bresponse.data;
		
			blocks.forEach(function(item) {
		
				if (!checkingblocks[item.height])
					checkingblocks.push(item.height);
		
			});
		
		}
		
		while (parseInt(scanBlockId) <= parseInt(currentHeight))
		{
		
			scanBlockId++;
			
			if (checkingblocks.indexOf(scanBlockId) != -1)
			{

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
							
											//console.log("txid:" + txdata.id);
											//console.log("vend:" + txdata.vendorField);
								
											var isjson = false;
							
											try {
												JSON.parse(txdata.vendorField);
												isjson = true;
											} catch (e) {
												//console.log("VendorField is not Valid JSON");
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
				
						rclient.set('qslt_lastblock', thisblockheight, function(err, reply){});

					}

				}

			}
		
		}

		scanLock = false;
        
	})();

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
												
												// Check for errors here
												

												
											}
								
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
    