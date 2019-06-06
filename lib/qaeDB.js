/*
* MongoDB Functions
*/

const MongoClient			= require('mongodb').MongoClient;
const assert 				= require('assert');
const Big 		 			= require('big.js');
const crypto 	 			= require('crypto');
const _ 					= require('underscore-node');

var qaeDB = /** @class */ (function () 
{

	var connectionString;
	var dbName;
	var db;
	var client;

    function qaeDB(connectionString, dbName) 
    {
    	if (connectionString === void 0)
        	this.connectionString = 'mongodb://localhost:27017';
        else
        	this.connectionString = connectionString;
        	
    	if (dbName === void 0)
        	this.dbName = 'qreditslt';
        else
        	this.dbName = dbName;
		
		return this;
        
    }

	qaeDB.prototype.connect = function() 
	{
		
		var connectionString = this.connectionString;
		var dbName = this.dbName;
	
		return new Promise((resolve, reject) => {
			
			MongoClient.connect(connectionString, { useNewUrlParser: true }, function(error, client) 
			{

      			if (error) {
					reject(error); return;
				}
								
  				//console.log("Connected Correctly to MongoDB Server - Database: " + dbName);
				
				resolve(client);

			});
  		
  		});
  		
	}

    qaeDB.prototype.setClient = function (client)
    {
    	
    	this.client = client;
    	this.db = client.db(this.dbName);
    	return true;
    
    };
    
    qaeDB.prototype.close = function ()
    {
    
    	return this.client.close();
    
    };
    
    /* Just a testing function */
    qaeDB.prototype.getConnectionString = function ()
    {
    
    	return this.connectionString;
    
    };
    
	qaeDB.prototype.findDocument = function(collection, query) 
	{
	
		var collection = this.db.collection(collection);
		
		return new Promise((resolve, reject) => {
	  		
  			collection.findOne(query, {projection:{ _id: 0 }}, function(error, docs) 
  			{

      			if (error) {
					reject(error); return;
				}
				resolve(docs);

  			});
  		
  		});
  		
	}
    
	qaeDB.prototype.findDocuments = function(collection, query, limit = 100, sort = {}, skip = 0) 
	{
	
  		var collection = this.db.collection(collection);

		return new Promise((resolve, reject) => {
  		
  			collection.find(query, {projection:{ _id: 0 }, limit: limit, sort: sort, skip: skip}).toArray(function(error, docs) 
  			{

      			if (error) {
					reject(error); return;
				}
				resolve(docs);

  			});
  		
  		});
  		
	}
	
	qaeDB.prototype.findDocumentCount = function(collection, query) 
	{
	
  		var collection = this.db.collection(collection);

		return new Promise((resolve, reject) => {
  		
  			collection.find(query, {}).count(function(error, count) 
  			{

      			if (error) {
					reject(error); return;
				}
				resolve(count);

  			});
  		
  		});
  		
	}
	
	qaeDB.prototype.findDocumentBigSum = function(collection, query, sumfield) 
	{
	
  		var collection = this.db.collection(collection);

		return new Promise((resolve, reject) => {
  		
  			collection.find(query, {}).toArray(function(error, results) 
  			{

      			if (error) {
					reject(error); return;
				}
								
   				let sum = _.reduce(results, function(memo, thisdoc)
   				{ 
   				
   					return new Big(memo).plus(eval("thisdoc." + sumfield)); // << TODO:  This is kind of a NO NO - We shouldn't use eval
   					
   				}, 0);
				
				resolve(sum);

  			});
  		
  		});
  		
	}
	
	qaeDB.prototype.findDocumentHash = function(collection, query, field, sort) 
	{
	
  		var collection = this.db.collection(collection);

		return new Promise((resolve, reject) => {
  		
  			collection.find(query, {projection:{ _id: 0 }, limit: 10, sort: sort, skip: 0}).toArray(function(error, results) 
  			{

      			if (error) {
					reject(error); return;
				}
								
   				let fieldcat = _.reduce(results, function(memo, thisdoc)
   				{ 
   				
   					return memo + '' + eval("thisdoc." + field); // << TODO:  This is kind of a NO NO - We shouldn't use eval
   					//return memo + '' + thisdoc[field];

   				}, 0);

				if (fieldcat)
					var hashcat = crypto.createHash('md5').update(fieldcat).digest('hex');
				else
					var hashcat = crypto.createHash('md5').update('').digest('hex');
					
				resolve(hashcat);
				
			
  			});
  		
  		});
  		
	}

	qaeDB.prototype.insertDocuments = function(collection, query) 
	{

  		var collection = this.db.collection(collection);

		return new Promise((resolve, reject) => {
	  		
			collection.insertMany([query], function(error, result) 
			{
			
      			if (error) {
					reject(error); return;
				}
				resolve(result);
			
			});
  		
  		});
  		
	}

	qaeDB.prototype.updateDocument = function(collection, findquery, setquery) 
	{
	
  		var collection = this.db.collection(collection);

		return new Promise((resolve, reject) => {
	  		
			collection.updateOne(findquery, { $set: setquery }, function(error, result) 
			{
			
      			if (error) {
					reject(error); return;
				}
				resolve(result);
				
			});
  		
  		});
  		
	}
    
	qaeDB.prototype.removeDocument = function(collection, query) 
	{
	
  		var collection = this.db.collection(collection);

		return new Promise((resolve, reject) => {
	  		
			collection.deleteOne(query, function(error, result) 
			{
			
      			if (error) {
					reject(error); 
					return;
				}
				resolve(result);
				
			});
  		
  		});
  		
	}
	
	qaeDB.prototype.removeDocuments = function(collection, query) 
	{

  		var collection = this.db.collection(collection);

		return new Promise((resolve, reject) => {
	  		
			collection.deleteMany(query, function(error, result) 
			{
			
      			if (error) {
					reject(error); 
					return;
				}
				resolve(result);
				
			});
  		
  		});
  		
	}
    
	qaeDB.prototype.createIndex = function(collection, query, unique = true) 
	{

  		var collection = this.db.collection(collection);

		return new Promise((resolve, reject) => {
	  		
			collection.createIndex(query, {background: true, unique: unique}, function(error, result) 
			{
						
      			if (error) {
					reject(error); 
					return;
				}
				resolve(result);
				
			});
  		
  		});
  		
	}

	qaeDB.prototype.createCollection = function(collection, options = {}) 
	{

		var db = this.db;
		
		return new Promise((resolve, reject) => {
	  		
			db.createCollection(collection, options, function(error, result) 
			{
			
      			if (error) {
					reject(error); 
					return;
				}
				resolve(result);
				
			});
  		
  		});
  		
	}
	
	qaeDB.prototype.doesCollectionExist = function(collection) 
	{

		var db = this.db;
		
		return new Promise((resolve, reject) => {

			db.listCollections().toArray(function(err, items)
			{

    			if (err) 
    			{
    				reject(err); 
    				return;
    			}
    			
    			if (items.length == 0) 
    			{
    				resolve(false);
    				return;
    			}
	
				for (var i = 0; i < items.length; i++) {
					if (items[i].name == collection)
					{
						resolve(true);
						return;
					}
				}
    			
    			resolve(false);
    			
			}); 
  			
  		});
  		
	}
    
    return qaeDB;
    
}());

exports.default = qaeDB;