const fs		  = require('fs');				 // so we can read the config ini file from disk
const ini		  = require('ini');				 // so we can parse the ini files properties
const Big		  = require('big.js');			 // required unless you want floating point math issues
const SparkMD5	  = require('spark-md5');  		 // Faster than crypto for md5
const {promisify} = require('util');			 // Promise functions
const asyncv3	  = require('async');			 // Async Helper

var iniconfig = ini.parse(fs.readFileSync('/etc/qae/qae.ini', 'utf-8'))

// Mongo Connection Details
const mongoconnecturl = iniconfig.mongo_connection_string;
const mongodatabase = iniconfig.mongo_database;

// MongoDB Library
const qaeDB = require("./lib/qaeDB");

var prevRecordHash = '';

(async () => {

	var qdbapi = new qaeDB.default(mongoconnecturl, mongodatabase);

	var mclient = await qdbapi.connect();
	qdbapi.setClient(mclient);
	
	var sort = {"_id":-1};
	
	var dbreply = await qdbapi.findDocumentsWithId('journal', {}, 1000000, sort, 0);

	for (let i = 0; i < dbreply.length; i++ )
	{
	
		var dbdata = dbreply[i];
		
		var chainHash = SparkMD5.hash(dbdata.recordHash + '' + prevRecordHash);
	
		prevRecordHash = dbdata.recordHash;
		
		await qdb.updateDocument('journal', {"_id": dbdata["_id"] }, {"chainHash": chainHash});

		if (i%100 == 0) console.log(i);	
		

	}
	
})();