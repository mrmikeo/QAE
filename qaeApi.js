/*
*
* QAE - Version 1.1.1
*
* Qredit Always Evolving
*
* A simplified token management system for the Qredit network
*
* QAEApi
*
*/

const express	  = require('express');			 // call express
const app		  = express();					 // define our app using express
const bodyParser  = require('body-parser');		 // for post calls
const cors		  = require('cors');			 // Cross Origin stuff
const redis		  = require('redis');			 // a really fast nosql keystore
const fs		  = require('fs');				 // so we can read the config ini file from disk
const ini		  = require('ini');				 // so we can parse the ini files properties
const Big		  = require('big.js');			 // required unless you want floating point math issues
const nodemailer  = require('nodemailer');		 // for sending error reports about this node
const crypto	  = require('crypto');			 // for creating hashes of things
const SparkMD5	  = require('spark-md5');  		 // Faster than crypto for md5
const request	  = require('request');			 // Library for making http requests
const publicIp	  = require('public-ip');		 // a helper to find out what our external IP is.	Needed for generating proper ring signatures
const {promisify} = require('util');			 // Promise functions
const asyncv3	  = require('async');			 // Async Helper
const { Client }  = require('pg');				 // Postgres
const qreditjs	  = require("qreditjs");
const path 		  = require('path');

var iniconfig = ini.parse(fs.readFileSync('/etc/qae/qae.ini', 'utf-8'))

// Mongo Connection Details
const mongoconnecturl = iniconfig.mongo_connection_string;
const mongodatabase = iniconfig.mongo_database;

// MongoDB Library
const qaeDB = require("./lib/qaeDB");

// Connect to Redis and setup some async call definitions
const rclient	= redis.createClient(iniconfig.redis_port, iniconfig.redis_host,{detect_buffers: true});
const hgetAsync = promisify(rclient.hget).bind(rclient);
const hsetAsync = promisify(rclient.hset).bind(rclient);
const getAsync	= promisify(rclient.get).bind(rclient);
const setAsync	= promisify(rclient.set).bind(rclient);
const delAsync	= promisify(rclient.del).bind(rclient);


// Declaring some variable defaults
var myIPAddress = '';
var goodPeers = {};
var badPeers = {};
var unvalidatedPeers = {};
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

// configure app to use bodyParser()
// this will let us get the data from a POST
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cors());

var port = iniconfig.api_port;

// We will keep in memory the ips that connect to us
var accessstats = [];

// ROUTES FOR OUR API
// =============================================================================

// get an instance of the express Router
var router = express.Router();				

// a test route to make sure everything is working (accessed at GET http://ip:port/api)
router.get('/', function(req, res) {
	res.json({ message: 'Qredit Always Evolving....	 Please see our API documentation' });	 
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
		//	sort = req.query.sort;
		//}

		updateaccessstats(req);
		
		var message = [];

		(async () => {
		
			var qdbapi = new qaeDB.default(mongoconnecturl, mongodatabase);
		
			var mclient = await qdbapi.connect();
			qdbapi.setClient(mclient);
			message = await qdbapi.findDocuments('tokens', {}, limit, sort, skip);
	
			qdbapi.close();
		
			res.json(message);
		
		})();
		
	});

router.route('/token/:id')
	.get(function(req, res) {

		var tokenid = req.params.id;
		
		updateaccessstats(req);
		
		var message = [];

		(async () => {
		
			var qdbapi = new qaeDB.default(mongoconnecturl, mongodatabase);
		
			var mclient = await qdbapi.connect();
			qdbapi.setClient(mclient);
			message = await qdbapi.findDocument('tokens', {'tokenDetails.tokenIdHex': tokenid});

			qdbapi.close();
			
			res.json(message);
		
		})();
		
	});

router.route('/tokenWithMeta/:id')
	.get(function(req, res) {

		var tokenid = req.params.id;
		
		updateaccessstats(req);
		
		var message = [];

		(async () => {
		
			var qdbapi = new qaeDB.default(mongoconnecturl, mongodatabase);
		
			var mclient = await qdbapi.connect();
			qdbapi.setClient(mclient);
			
			message = await qdbapi.findDocument('tokens', {'tokenDetails.tokenIdHex': tokenid});
			
			message.metadata = await qdbapi.findDocuments('metadata', {"metaDetails.tokenIdHex":tokenid}, 9999, {"metaDetails.timestamp_unix":1, "metaDetails.chunk":1}, 0);
			
			qdbapi.close();
			
			res.json(message);
		
		})();
		
	});
	
router.route('/tokenByTxid/:txid')
	.get(function(req, res) {

		var txid = req.params.txid;
		
		updateaccessstats(req);
		
		var message = [];

		(async () => {
		
			var qdbapi = new qaeDB.default(mongoconnecturl, mongodatabase);
		
			var mclient = await qdbapi.connect();
			qdbapi.setClient(mclient);
			message = await qdbapi.findDocuments('tokens', {'tokenStats.creation_transaction_id': txid});

			qdbapi.close();
			
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
		
			var qdbapi = new qaeDB.default(mongoconnecturl, mongodatabase);
		
			var mclient = await qdbapi.connect();
			qdbapi.setClient(mclient);
			message = await qdbapi.findDocuments('addresses', {}, limit, sort, skip);

			qdbapi.close();
			
			res.json(message);
		
		})();
				
	});

router.route('/address/:addr')
	.get(function(req, res) {

		var addr = req.params.addr;

		updateaccessstats(req);
		
		var message = [];

		(async () => {
		
		var qdbapi = new qaeDB.default(mongoconnecturl, mongodatabase);
		
			var mclient = await qdbapi.connect();
			qdbapi.setClient(mclient);
			message = await qdbapi.findDocuments('addresses', {"address": addr});

			qdbapi.close();
			
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
		
		var qdbapi = new qaeDB.default(mongoconnecturl, mongodatabase);
		
			var mclient = await qdbapi.connect();
			qdbapi.setClient(mclient);
			message = await qdbapi.findDocuments('addresses', {"tokenIdHex": tokenid}, limit, sort, skip);

			qdbapi.close();
			
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
		
		var qdbapi = new qaeDB.default(mongoconnecturl, mongodatabase);
		
			var mclient = await qdbapi.connect();
			qdbapi.setClient(mclient);

			var rawRecordId = addr + '.' + tokenid;
			//var recordId = crypto.createHash('md5').update(rawRecordId).digest('hex');
			var recordId = SparkMD5.hash(rawRecordId);
			
			message = await qdbapi.findDocument('addresses', {"recordId": recordId});

			qdbapi.close();
			
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
		
		var qdbapi = new qaeDB.default(mongoconnecturl, mongodatabase);
		
			var mclient = await qdbapi.connect();
			qdbapi.setClient(mclient);
			message = await qdbapi.findDocuments('transactions', {}, limit, sort, skip);

			qdbapi.close();
			
			res.json(message);
		
		})();
				
	});

router.route('/transaction/:txid')
	.get(function(req, res) {

		var txid = req.params.txid;

		updateaccessstats(req);
		
		var message = [];

		(async () => {
		
		var qdbapi = new qaeDB.default(mongoconnecturl, mongodatabase);
		
			var mclient = await qdbapi.connect();
			qdbapi.setClient(mclient);
			message = await qdbapi.findDocuments('transactions', {"txid": txid});

			qdbapi.close();
			
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
		
		var qdbapi = new qaeDB.default(mongoconnecturl, mongodatabase);
		
			var mclient = await qdbapi.connect();
			qdbapi.setClient(mclient);
			
			var mquery = {"transactionDetails.tokenIdHex":tokenid};
			
			message = await qdbapi.findDocuments('transactions', mquery, limit, sort, skip);

			qdbapi.close();
			
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
		
			var qdbapi = new qaeDB.default(mongoconnecturl, mongodatabase);
		
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

			qdbapi.close();
			
			res.json(message);
		
		})();
				
	});
	
router.route('/metadata/:txid')
	.get(function(req, res) {

		var txid = req.params.txid;

		updateaccessstats(req);
		
		var message = [];

		(async () => {
		
		var qdbapi = new qaeDB.default(mongoconnecturl, mongodatabase);
		
			var mclient = await qdbapi.connect();
			qdbapi.setClient(mclient);
			message = await qdbapi.findDocuments('metadata', {"txid": txid});

			qdbapi.close();
			
			res.json(message);
		
		})();
				
	});
	
router.route('/metadata/:tokenid')
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

		var sort = {"metaDetails.timestamp_unix":1, "metaDetails.chunk":1};

		updateaccessstats(req);
		
		var message = [];

		(async () => {
		
		var qdbapi = new qaeDB.default(mongoconnecturl, mongodatabase);
		
			var mclient = await qdbapi.connect();
			qdbapi.setClient(mclient);
			
			var mquery = {"metaDetails.tokenIdHex":tokenid};
			
			message = await qdbapi.findDocuments('metadata', mquery, limit, sort, skip);

			qdbapi.close();
			
			res.json(message);
		
		})();
				
	});

router.route('/metadata/:tokenid/:address')
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

		var sort = {"metaDetails.timestamp_unix":1, "metaDetails.chunk":1};
		
		updateaccessstats(req);
		
		var message = [];

		(async () => {
		
			var qdbapi = new qaeDB.default(mongoconnecturl, mongodatabase);
		
			var mclient = await qdbapi.connect();
			qdbapi.setClient(mclient);
			
			var mquery = {
				$and : 
				[
					{ 
						"metaDetails.posterAddress": address
					},
					{ 
						"metaDetails.tokenIdHex":tokenid
					}
				]
			};
			
			message = await qdbapi.findDocuments('metadata', mquery, limit, sort, skip);

			qdbapi.close();
			
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
		
			var qdbapi = new qaeDB.default(mongoconnecturl, mongodatabase);
		
			var mclient = await qdbapi.connect();
			qdbapi.setClient(mclient);
			message = await qdbapi.findDocuments('tokens', {"tokenDetails.ownerAddress": ownerId}, limit, sort, skip);

			qdbapi.close();
			
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
	
router.route('/peerInfo')
	.get(function(req, res) {

		updateaccessstats(req);
		
		var thisPeer = myIPAddress + ":" + port;
		
		var message = {goodPeers: goodPeers, badPeers: badPeers, unvalidatedPeers: unvalidatedPeers, thisPeer: thisPeer};

		res.json(message);
		
	});
	
router.route('/getHeight')
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
	
router.route('/getRingSignature/:journalid')
	.get(function(req, res) {
	
		var journalid = parseInt(req.params.journalid);

		updateaccessstats(req);
		
		var message = {};
		
		(async () => {
		
			var qdbapi = new qaeDB.default(mongoconnecturl, mongodatabase);
		
			var mclient = await qdbapi.connect();
			qdbapi.setClient(mclient);
			
			var dbreply = await qdbapi.findDocument('journal', {"_id": journalid});

			qdbapi.close();
			
			if (dbreply)
			{
			
				var ringsignature = crypto.createHash('sha256').update(myIPAddress + dbreply.chainHash).digest('hex');

				message = {ip: myIPAddress, port: parseInt(port), journalid: journalid, ringsignature: ringsignature};
			
				res.json(message);
			
			}
			else
			{

				message = {ip: myIPAddress, port: parseInt(port), journalid: journalid, ringsignature: '', error: 'Signature Not Found'};
			
				res.json(message);
			
			}

		})();
		
	});
	
router.route('/getRingSignature/:journalid/:callerport')
	.get(function(req, res) {
	
		var journalid = parseInt(req.params.journalid);
		var callerport = parseInt(req.params.callerport);

		updateaccessstats(req);
		
		var message = {};

		(async () => {
		
			var qdbapi = new qaeDB.default(mongoconnecturl, mongodatabase);
		
			var mclient = await qdbapi.connect();
			qdbapi.setClient(mclient);
			
			var dbreply = await qdbapi.findDocument('journal', {"_id": journalid});

			qdbapi.close();
			
			if (dbreply)
			{
			
				var ringsignature = crypto.createHash('sha256').update(myIPAddress + dbreply.chainHash).digest('hex');

				message = {ip: myIPAddress, port: parseInt(port), journalid: journalid, ringsignature: ringsignature};
			
				res.json(message);
			
			}
			else
			{

				message = {ip: myIPAddress, port: parseInt(port), journalid: journalid, ringsignature: '', error: 'Signature Not Found'};
			
				res.json(message);
			
			}

		})();
		
		var callerip = getCallerIP(req).toString();
		
		if (!goodPeers[callerip + ":" + callerport] && !unvalidatedPeers[callerip + ":" + callerport])
		{
			unvalidatedPeers[callerip + ":" + callerport] = {ip: callerip, port: parseInt(callerport)};
		}
		
	});
	
router.route('/getJournals/:start/:end')
	.get(function(req, res) {
	
		var startjournalid = parseInt(req.params.start);
		var endjournalid = parseInt(req.params.end);

		updateaccessstats(req);
		
		var message = [];

		(async () => {
		
			var qdbapi = new qaeDB.default(mongoconnecturl, mongodatabase);
		
			var mclient = await qdbapi.connect();
			qdbapi.setClient(mclient);
			
			var dbreply = await qdbapi.findDocuments('journal', { $and: [ { "_id": { $gte: startjournalid } }, { "_id": { $lte: endjournalid } } ] });

			qdbapi.close();
			
			if (dbreply)
			{
			
				for (let i = 0; i < dbreply.length; i++)
				{
				
					var mbody = dbreply[i];
					mbody['chainHash'] = '';
					
					message.push(mbody);
			
				}
				
				res.json(message);
			
			}
			else
			{
			
				res.json(message);
			
			}

		})();
		
	});

router.route('/vendor_qae1_genesis')
	.get(function(req, res) {
	
		updateaccessstats(req);
		
		var requiredfields = ['decimals','symbol','name','quantity'];
		
		for (let i = 0; i < requiredfields.length; i++)
		{
		
			var fieldname = requiredfields[i];

			if (!req.query[fieldname])
			{

				message = {error: {code: 10001, message: 'Validation Error', description: 'Missing "' + fieldname + '" field.'}};
				res.status(400).json(message);
				
				break;
						
			}
		
		}
		
		try {
		
			var jsonobject = {qae1:{}};
		
			jsonobject.qae1.tp = "GENESIS";
			jsonobject.qae1.de = req.query.decimals;
			jsonobject.qae1.sy = req.query.symbol;
			jsonobject.qae1.na = req.query.name;
		
		
			var adjustdecimals = parseInt(req.query.decimals);
			var adjustexponent = '1e' + adjustdecimals;
			var neweamount = Big(req.query.quantity).times(adjustexponent).toFixed(0);
		
			jsonobject.qae1.qt = neweamount;
		
			if (req.query.uri)
				jsonobject.qae1.du = req.query.uri;
			
			if (req.query.notes)	
				jsonobject.qae1.no = req.query.notes;
		
			if (req.query.pa)
				jsonobject.qae1.pa = req.query.pausable;
		
			if (req.query.mi)
				jsonobject.qae1.mi = req.query.mintable;
				
			res.status(200).send(JSON.stringify(jsonobject));
			
		} catch (e) {

			message = {error: {code: 400, message: 'Unknown Error', description: 'Check your inputs to ensure they are properly formatted.'}};
			res.status(400).json(message);
		
		}
		
	});
	
router.route('/vendor_qae1_burn')
	.get(function(req, res) {
	
		updateaccessstats(req);
		
		var requiredfields = ['tokenid','quantity'];
		
		for (let i = 0; i < requiredfields.length; i++)
		{
		
			var fieldname = requiredfields[i];

			if (!req.query[fieldname])
			{

				message = {error: {code: 10001, message: 'Validation Error', description: 'Missing "' + fieldname + '" field.'}};
				res.status(400).json(message);
				
				break;
						
			}
		
		}
		
		(async () => {
		
			try {
		
				var qdbapi = new qaeDB.default(mongoconnecturl, mongodatabase);
		
				var mclient = await qdbapi.connect();
				qdbapi.setClient(mclient);
				var tokeninfo = await qdbapi.findDocument('tokens', {'tokenDetails.tokenIdHex': req.query.tokenid});

				qdbapi.close();
			
				var decimals = tokeninfo.tokenDetails.decimals;
		
				var jsonobject = {qae1:{}};
		
				jsonobject.qae1.tp = "BURN";
				jsonobject.qae1.id = req.query.tokenid;

				var adjustdecimals = parseInt(decimals);
				var adjustexponent = '1e' + adjustdecimals;
				var neweamount = Big(req.query.quantity).times(adjustexponent).toFixed(0);
		
				jsonobject.qae1.qt = neweamount;
		
				if (req.query.notes)	
					jsonobject.qae1.no = req.query.notes;
				
				res.status(200).send(JSON.stringify(jsonobject));
			
			} catch (e) {

				message = {error: {code: 400, message: 'Unknown Error', description: 'Check your inputs to ensure they are properly formatted.'}};
				res.status(400).json(message);
		
			}
		
		})();
		
	});
	
router.route('/vendor_qae1_mint')
	.get(function(req, res) {
	
		updateaccessstats(req);
		
		var requiredfields = ['tokenid','quantity'];
		
		for (let i = 0; i < requiredfields.length; i++)
		{
		
			var fieldname = requiredfields[i];

			if (!req.query[fieldname])
			{

				message = {error: {code: 10001, message: 'Validation Error', description: 'Missing "' + fieldname + '" field.'}};
				res.status(400).json(message);
				
				break;
						
			}
		
		}
		
		(async () => {
		
			try {
		
				var qdbapi = new qaeDB.default(mongoconnecturl, mongodatabase);
		
				var mclient = await qdbapi.connect();
				qdbapi.setClient(mclient);
				var tokeninfo = await qdbapi.findDocument('tokens', {'tokenDetails.tokenIdHex': req.query.tokenid});

				qdbapi.close();
			
				var decimals = tokeninfo.tokenDetails.decimals;
		
				var jsonobject = {qae1:{}};
		
				jsonobject.qae1.tp = "MINT";
				jsonobject.qae1.id = req.query.tokenid;

				var adjustdecimals = parseInt(decimals);
				var adjustexponent = '1e' + adjustdecimals;
				var neweamount = Big(req.query.quantity).times(adjustexponent).toFixed(0);
		
				jsonobject.qae1.qt = neweamount;
		
				if (req.query.notes)	
					jsonobject.qae1.no = req.query.notes;
				
				res.status(200).send(JSON.stringify(jsonobject));
			
			} catch (e) {

				message = {error: {code: 400, message: 'Unknown Error', description: 'Check your inputs to ensure they are properly formatted.'}};
				res.status(400).json(message);
		
			}
		
		})();
		
	});

router.route('/vendor_qae1_send')
	.get(function(req, res) {
	
		updateaccessstats(req);
		
		var requiredfields = ['tokenid','quantity'];
		
		for (let i = 0; i < requiredfields.length; i++)
		{
		
			var fieldname = requiredfields[i];

			if (!req.query[fieldname])
			{

				message = {error: {code: 10001, message: 'Validation Error', description: 'Missing "' + fieldname + '" field.'}};
				res.status(400).json(message);
				
				break;
						
			}
		
		}
		
		(async () => {
		
			try {
		
				var qdbapi = new qaeDB.default(mongoconnecturl, mongodatabase);
		
				var mclient = await qdbapi.connect();
				qdbapi.setClient(mclient);
				var tokeninfo = await qdbapi.findDocument('tokens', {'tokenDetails.tokenIdHex': req.query.tokenid});

				qdbapi.close();
			
				var decimals = tokeninfo.tokenDetails.decimals;
		
				var jsonobject = {qae1:{}};
		
				jsonobject.qae1.tp = "SEND";
				jsonobject.qae1.id = req.query.tokenid;

				var adjustdecimals = parseInt(decimals);
				var adjustexponent = '1e' + adjustdecimals;
				var neweamount = Big(req.query.quantity).times(adjustexponent).toFixed(0);
		
				jsonobject.qae1.qt = neweamount;
		
				if (req.query.notes)	
					jsonobject.qae1.no = req.query.notes;
				
				res.status(200).send(JSON.stringify(jsonobject));
			
			} catch (e) {

				message = {error: {code: 400, message: 'Unknown Error', description: 'Check your inputs to ensure they are properly formatted.'}};
				res.status(400).json(message);
		
			}
		
		})();
		
	});
	
router.route('/vendor_qae1_pause')
	.get(function(req, res) {
	
		updateaccessstats(req);
		
		var requiredfields = ['tokenid'];
		
		for (let i = 0; i < requiredfields.length; i++)
		{
		
			var fieldname = requiredfields[i];

			if (!req.query[fieldname])
			{

				message = {error: {code: 10001, message: 'Validation Error', description: 'Missing "' + fieldname + '" field.'}};
				res.status(400).json(message);
				
				break;
						
			}
		
		}
		
		(async () => {
		
			try {
		
				var jsonobject = {qae1:{}};
		
				jsonobject.qae1.tp = "PAUSE";
				jsonobject.qae1.id = req.query.tokenid;
		
				if (req.query.notes)	
					jsonobject.qae1.no = req.query.notes;
				
				res.status(200).send(JSON.stringify(jsonobject));
			
			} catch (e) {

				message = {error: {code: 400, message: 'Unknown Error', description: 'Check your inputs to ensure they are properly formatted.'}};
				res.status(400).json(message);
		
			}
		
		})();
		
	});

router.route('/vendor_qae1_resume')
	.get(function(req, res) {
	
		updateaccessstats(req);
		
		var requiredfields = ['tokenid'];
		
		for (let i = 0; i < requiredfields.length; i++)
		{
		
			var fieldname = requiredfields[i];

			if (!req.query[fieldname])
			{

				message = {error: {code: 10001, message: 'Validation Error', description: 'Missing "' + fieldname + '" field.'}};
				res.status(400).json(message);
				
				break;
						
			}
		
		}
		
		(async () => {
		
			try {
		
				var jsonobject = {qae1:{}};
		
				jsonobject.qae1.tp = "RESUME";
				jsonobject.qae1.id = req.query.tokenid;
		
				if (req.query.notes)	
					jsonobject.qae1.no = req.query.notes;
				
				res.status(200).send(JSON.stringify(jsonobject));
			
			} catch (e) {

				message = {error: {code: 400, message: 'Unknown Error', description: 'Check your inputs to ensure they are properly formatted.'}};
				res.status(400).json(message);
		
			}
		
		})();
		
	});
	
router.route('/vendor_qae1_newowner')
	.get(function(req, res) {
	
		updateaccessstats(req);
		
		var requiredfields = ['tokenid'];
		
		for (let i = 0; i < requiredfields.length; i++)
		{
		
			var fieldname = requiredfields[i];

			if (!req.query[fieldname])
			{

				message = {error: {code: 10001, message: 'Validation Error', description: 'Missing "' + fieldname + '" field.'}};
				res.status(400).json(message);
				
				break;
						
			}
		
		}
		
		(async () => {
		
			try {
		
				var jsonobject = {qae1:{}};
		
				jsonobject.qae1.tp = "NEWOWNER";
				jsonobject.qae1.id = req.query.tokenid;
		
				if (req.query.notes)	
					jsonobject.qae1.no = req.query.notes;
				
				res.status(200).send(JSON.stringify(jsonobject));
			
			} catch (e) {

				message = {error: {code: 400, message: 'Unknown Error', description: 'Check your inputs to ensure they are properly formatted.'}};
				res.status(400).json(message);
		
			}
		
		})();
		
	});

router.route('/vendor_qae1_freeze')
	.get(function(req, res) {
	
		updateaccessstats(req);
		
		var requiredfields = ['tokenid'];
		
		for (let i = 0; i < requiredfields.length; i++)
		{
		
			var fieldname = requiredfields[i];

			if (!req.query[fieldname])
			{

				message = {error: {code: 10001, message: 'Validation Error', description: 'Missing "' + fieldname + '" field.'}};
				res.status(400).json(message);
				
				break;
						
			}
		
		}
		
		(async () => {
		
			try {
		
				var jsonobject = {qae1:{}};
		
				jsonobject.qae1.tp = "FREEZE";
				jsonobject.qae1.id = req.query.tokenid;
		
				if (req.query.notes)	
					jsonobject.qae1.no = req.query.notes;
				
				res.status(200).send(JSON.stringify(jsonobject));
			
			} catch (e) {

				message = {error: {code: 400, message: 'Unknown Error', description: 'Check your inputs to ensure they are properly formatted.'}};
				res.status(400).json(message);
		
			}
		
		})();
		
	});

router.route('/vendor_qae1_unfreeze')
	.get(function(req, res) {
	
		updateaccessstats(req);
		
		var requiredfields = ['tokenid'];
		
		for (let i = 0; i < requiredfields.length; i++)
		{
		
			var fieldname = requiredfields[i];

			if (!req.query[fieldname])
			{

				message = {error: {code: 10001, message: 'Validation Error', description: 'Missing "' + fieldname + '" field.'}};
				res.status(400).json(message);
				
				break;
						
			}
		
		}
		
		(async () => {
		
			try {
		
				var jsonobject = {qae1:{}};
		
				jsonobject.qae1.tp = "UNFREEZE";
				jsonobject.qae1.id = req.query.tokenid;
		
				if (req.query.notes)	
					jsonobject.qae1.no = req.query.notes;
				
				res.status(200).send(JSON.stringify(jsonobject));
			
			} catch (e) {

				message = {error: {code: 400, message: 'Unknown Error', description: 'Check your inputs to ensure they are properly formatted.'}};
				res.status(400).json(message);
		
			}
		
		})();
		
	});
	
// qae 2

router.route('/vendor_qae2_genesis')
	.get(function(req, res) {
	
		updateaccessstats(req);
		
		var requiredfields = ['symbol','name'];
		
		for (let i = 0; i < requiredfields.length; i++)
		{
		
			var fieldname = requiredfields[i];

			if (!req.query[fieldname])
			{

				message = {error: {code: 10001, message: 'Validation Error', description: 'Missing "' + fieldname + '" field.'}};
				res.status(400).json(message);
				
				break;
						
			}
		
		}
		
		try {
		
			var jsonobject = {qae2:{}};
		
			jsonobject.qae2.tp = "GENESIS";
			jsonobject.qae2.sy = req.query.symbol;
			jsonobject.qae2.na = req.query.name;
		
			if (req.query.uri)
				jsonobject.qae2.du = req.query.uri;
			
			if (req.query.notes)	
				jsonobject.qae2.no = req.query.notes;
		
			if (req.query.pa)
				jsonobject.qae2.pa = req.query.pausable;
				
			res.status(200).send(JSON.stringify(jsonobject));
			
		} catch (e) {

			message = {error: {code: 400, message: 'Unknown Error', description: 'Check your inputs to ensure they are properly formatted.'}};
			res.status(400).json(message);
		
		}
		
	});
	
router.route('/vendor_qae2_pause')
	.get(function(req, res) {
	
		updateaccessstats(req);
		
		var requiredfields = ['tokenid'];
		
		for (let i = 0; i < requiredfields.length; i++)
		{
		
			var fieldname = requiredfields[i];

			if (!req.query[fieldname])
			{

				message = {error: {code: 10001, message: 'Validation Error', description: 'Missing "' + fieldname + '" field.'}};
				res.status(400).json(message);
				
				break;
						
			}
		
		}
		
		(async () => {
		
			try {
		
				var jsonobject = {qae2:{}};
		
				jsonobject.qae2.tp = "PAUSE";
				jsonobject.qae2.id = req.query.tokenid;
		
				if (req.query.notes)	
					jsonobject.qae2.no = req.query.notes;
				
				res.status(200).send(JSON.stringify(jsonobject));
			
			} catch (e) {

				message = {error: {code: 400, message: 'Unknown Error', description: 'Check your inputs to ensure they are properly formatted.'}};
				res.status(400).json(message);
		
			}
		
		})();
		
	});

router.route('/vendor_qae2_resume')
	.get(function(req, res) {
	
		updateaccessstats(req);
		
		var requiredfields = ['tokenid'];
		
		for (let i = 0; i < requiredfields.length; i++)
		{
		
			var fieldname = requiredfields[i];

			if (!req.query[fieldname])
			{

				message = {error: {code: 10001, message: 'Validation Error', description: 'Missing "' + fieldname + '" field.'}};
				res.status(400).json(message);
				
				break;
						
			}
		
		}
		
		(async () => {
		
			try {
		
				var jsonobject = {qae2:{}};
		
				jsonobject.qae2.tp = "RESUME";
				jsonobject.qae2.id = req.query.tokenid;
		
				if (req.query.notes)	
					jsonobject.qae2.no = req.query.notes;
				
				res.status(200).send(JSON.stringify(jsonobject));
			
			} catch (e) {

				message = {error: {code: 400, message: 'Unknown Error', description: 'Check your inputs to ensure they are properly formatted.'}};
				res.status(400).json(message);
		
			}
		
		})();
		
	});
	
router.route('/vendor_qae2_newowner')
	.get(function(req, res) {
	
		updateaccessstats(req);
		
		var requiredfields = ['tokenid'];
		
		for (let i = 0; i < requiredfields.length; i++)
		{
		
			var fieldname = requiredfields[i];

			if (!req.query[fieldname])
			{

				message = {error: {code: 10001, message: 'Validation Error', description: 'Missing "' + fieldname + '" field.'}};
				res.status(400).json(message);
				
				break;
						
			}
		
		}
		
		(async () => {
		
			try {
		
				var jsonobject = {qae2:{}};
		
				jsonobject.qae2.tp = "NEWOWNER";
				jsonobject.qae2.id = req.query.tokenid;
		
				if (req.query.notes)	
					jsonobject.qae2.no = req.query.notes;
				
				res.status(200).send(JSON.stringify(jsonobject));
			
			} catch (e) {

				message = {error: {code: 400, message: 'Unknown Error', description: 'Check your inputs to ensure they are properly formatted.'}};
				res.status(400).json(message);
		
			}
		
		})();
		
	});

router.route('/vendor_qae2_authmeta')
	.get(function(req, res) {
	
		updateaccessstats(req);
		
		var requiredfields = ['tokenid'];
		
		for (let i = 0; i < requiredfields.length; i++)
		{
		
			var fieldname = requiredfields[i];

			if (!req.query[fieldname])
			{

				message = {error: {code: 10001, message: 'Validation Error', description: 'Missing "' + fieldname + '" field.'}};
				res.status(400).json(message);
				
				break;
						
			}
		
		}
		
		(async () => {
		
			try {
		
				var jsonobject = {qae2:{}};
		
				jsonobject.qae2.tp = "AUTHMETA";
				jsonobject.qae2.id = req.query.tokenid;
		
				if (req.query.notes)	
					jsonobject.qae2.no = req.query.notes;
				
				res.status(200).send(JSON.stringify(jsonobject));
			
			} catch (e) {

				message = {error: {code: 400, message: 'Unknown Error', description: 'Check your inputs to ensure they are properly formatted.'}};
				res.status(400).json(message);
		
			}
		
		})();
		
	});

router.route('/vendor_qae2_revokemeta')
	.get(function(req, res) {
	
		updateaccessstats(req);
		
		var requiredfields = ['tokenid'];
		
		for (let i = 0; i < requiredfields.length; i++)
		{
		
			var fieldname = requiredfields[i];

			if (!req.query[fieldname])
			{

				message = {error: {code: 10001, message: 'Validation Error', description: 'Missing "' + fieldname + '" field.'}};
				res.status(400).json(message);
				
				break;
						
			}
		
		}
		
		(async () => {
		
			try {
		
				var jsonobject = {qae2:{}};
		
				jsonobject.qae2.tp = "REVOKEMETA";
				jsonobject.qae2.id = req.query.tokenid;
		
				if (req.query.notes)	
					jsonobject.qae2.no = req.query.notes;
				
				res.status(200).send(JSON.stringify(jsonobject));
			
			} catch (e) {

				message = {error: {code: 400, message: 'Unknown Error', description: 'Check your inputs to ensure they are properly formatted.'}};
				res.status(400).json(message);
		
			}
		
		})();
		
	});

router.route('/vendor_qae2_clone')
	.get(function(req, res) {
	
		updateaccessstats(req);
		
		var requiredfields = ['tokenid'];
		
		for (let i = 0; i < requiredfields.length; i++)
		{
		
			var fieldname = requiredfields[i];

			if (!req.query[fieldname])
			{

				message = {error: {code: 10001, message: 'Validation Error', description: 'Missing "' + fieldname + '" field.'}};
				res.status(400).json(message);
				
				break;
						
			}
		
		}
		
		(async () => {
		
			try {
		
				var jsonobject = {qae2:{}};
		
				jsonobject.qae2.tp = "CLONE";
				jsonobject.qae2.id = req.query.tokenid;
		
				if (req.query.notes)	
					jsonobject.qae2.no = req.query.notes;
				
				res.status(200).send(JSON.stringify(jsonobject));
			
			} catch (e) {

				message = {error: {code: 400, message: 'Unknown Error', description: 'Check your inputs to ensure they are properly formatted.'}};
				res.status(400).json(message);
		
			}
		
		})();
		
	});

router.route('/vendor_qae2_addmeta')
	.get(function(req, res) {
	
		updateaccessstats(req);
		
		var requiredfields = ['tokenid', 'name', 'data'];
		
		for (let i = 0; i < requiredfields.length; i++)
		{
		
			var fieldname = requiredfields[i];

			if (!req.query[fieldname])
			{

				message = {error: {code: 10001, message: 'Validation Error', description: 'Missing "' + fieldname + '" field.'}};
				res.status(400).json(message);
				
				break;
						
			}
		
		}
		
		(async () => {
		
			try {
		
				var jsonobject = {qae2:{}};
		
				jsonobject.qae2.tp = "ADDMETA";
				jsonobject.qae2.id = req.query.tokenid;
				jsonobject.qae2.na = req.query.name;
				jsonobject.qae2.dt = req.query.data;
		
				if (req.query.chunk)	
					jsonobject.qae2.ch = req.query.chunk;
				
				res.status(200).send(JSON.stringify(jsonobject));
			
			} catch (e) {

				message = {error: {code: 400, message: 'Unknown Error', description: 'Check your inputs to ensure they are properly formatted.'}};
				res.status(400).json(message);
		
			}
		
		})();
		
	});

router.route('/vendor_qae2_voidmeta')
	.get(function(req, res) {
	
		updateaccessstats(req);
		
		var requiredfields = ['tokenid','txid'];
		
		for (let i = 0; i < requiredfields.length; i++)
		{
		
			var fieldname = requiredfields[i];

			if (!req.query[fieldname])
			{

				message = {error: {code: 10001, message: 'Validation Error', description: 'Missing "' + fieldname + '" field.'}};
				res.status(400).json(message);
				
				break;
						
			}
		
		}
		
		(async () => {
		
			try {
		
				var jsonobject = {qae2:{}};
		
				jsonobject.qae2.tp = "VOIDMETA";
				jsonobject.qae2.id = req.query.tokenid;
				jsonobject.qae2.tx = req.query.transactionid;
				
				res.status(200).send(JSON.stringify(jsonobject));
			
			} catch (e) {

				message = {error: {code: 400, message: 'Unknown Error', description: 'Check your inputs to ensure they are properly formatted.'}};
				res.status(400).json(message);
		
			}
		
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

app.use(express.static(path.join(__dirname, 'public')));

initialize();

var intervalpeers = setInterval(function() {

	testPeers();
  
}, 60000);

var intervalseeds = setInterval(function() {

	var nowTime = Math.floor(new Date() / 1000);

	if (gotSeedPeers < nowTime - 900) // Check for seeds every 15 minutes
	{
		gotSeedPeers = nowTime;
		getSeedPeers();
	}
	
}, 900000);

function initialize()
{

	(async () => {

		// START THE SERVER
		// =============================================================================
		app.listen(port);
		console.log('Magic happens on Port:' + port);

		myIPAddress = await publicIp.v4();
						
		console.log("This IP Address is: " + myIPAddress);
			
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
		
		getSeedPeers();
		
		// Defaults qm2/qm3
		validatePeer('95.217.180.3', 80);
		validatePeer('116.203.40.82', 80);
		
	})();		 

}

// Main Functions
// ==========================


function newblocknotify()
{

	console.log('New Block Notify Received..');
	
	rclient.rpush('blockNotify', 'new');
	
	return true;

}

function validatePeer(peerip, peerport)
{

	if (peerip == myIPAddress) return false;

	peerport = parseInt(peerport);

	var peerapiurl = "http://" + peerip + ":" + peerport + "/api";
	
	(async () => {
	
		var qdbapi = new qaeDB.default(mongoconnecturl, mongodatabase);
	
		var mclient = await qdbapi.connect();
		qdbapi.setClient(mclient);
		
		var sort = {"_id":-1};
		
		var dbreply = await qdbapi.findDocumentsWithId('journal', {}, 1, sort, 0);

		qdbapi.close();
		
		if (dbreply)
		{

			var journalid = dbreply[0]['_id'];
			var chainhash = dbreply[0]['chainHash'];

console.log("Validating " + peerip + ":" + peerport + " at journalid " + journalid);

			// This is what the peer hash should be
			
			var ringsignature = crypto.createHash('sha256').update(peerip + chainhash).digest('hex');

console.log("RingSig should be: " + ringsignature);

			request.get(peerapiurl + '/getRingSignature/' + journalid + '/' + port, {json:true}, function (error, response, body) 
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
							goodPeers[peerip + ":" + peerport] = {ip: peerip, port: peerport, lastJournalId: journalid};
							delete unvalidatedPeers[peerip + ":" + peerport];
							delete badPeers[peerip + ":" + peerport];
							getPeers(peerip + ":" + peerport);
						
						}
						else
						{
						
							delete goodPeers[peerip + ":" + peerport];
							delete unvalidatedPeers[peerip + ":" + peerport];
							badPeers[peerip + ":" + peerport] = {ip: peerip, port: peerport, lastJournalId: journalid};
						
						}
					
					}
					else
					{

console.log("Unable to validate at journalid: " + journalid);

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

console.log("We cannot get ringsig info from journal db... ");
		
		}

	})();

}

function getSeedPeers()
{

	request.get(seedNode + '/peerInfo', {json:true}, function (error, response, body) 
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
	var hex	 = str1.toString();
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
  var match = (Big(num).toString()).match(/(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
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
	
