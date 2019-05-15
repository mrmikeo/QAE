/*
* MongoDB Functions
*/

const MongoClient = require('mongodb').MongoClient;
const assert 	 = require('assert');

var qsltDB = /** @class */ (function () 
{

	var connectionString;
	var dbName;
	var db;
	var client;

    function qsltDB(connectionString, dbName) 
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

	qsltDB.prototype.connect = function() 
	{
		
		var connectionString = this.connectionString;
		var dbName = this.dbName;
	
		return new Promise((resolve, reject) => {
			
			MongoClient.connect(connectionString, { useNewUrlParser: true }, function(error, client) 
			{

      			if (error) {
					reject(error); return;
				}
								
  				console.log("Connected Correctly to MongoDB Server - Database: " + dbName);
				
				resolve(client);

			});
  		
  		});
  		
	}

    qsltDB.prototype.setClient = function (client)
    {
    	
    	this.client = client;
    	this.db = client.db(this.dbName);
    	return true;
    
    };
    
    qsltDB.prototype.close = function ()
    {
    
    	return this.client.close();
    
    };
    
    /* Just a testing function */
    qsltDB.prototype.getConnectionString = function ()
    {
    
    	return this.connectionString;
    
    };
    
	qsltDB.prototype.findDocument = function(collection, query) 
	{
	
		var collection = this.db.collection(collection);
		
		return new Promise((resolve, reject) => {
	  		
  			collection.findOne(query).toArray(function(error, docs) 
  			{

      			if (error) {
					reject(error); return;
				}
				resolve(docs);

  			});
  		
  		});
  		
	}
    
	qsltDB.prototype.findDocuments = function(collection, query, limit = 100, sort = {}, skip = 0) 
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
    
	qsltDB.prototype.insertDocuments = function(collection, query) 
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

	qsltDB.prototype.updateDocument = function(collection, findquery, setquery) 
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
    
	qsltDB.prototype.removeDocument = function(collection, query) 
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
	
	qsltDB.prototype.removeDocuments = function(collection, query) 
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
    
	qsltDB.prototype.createIndex = function(collection, query, unique = true) 
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

	qsltDB.prototype.createCollection = function(collection, options = {}) 
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
	
	qsltDB.prototype.doesCollectionExist = function(collection) 
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
    
    return qsltDB;
    
}());

exports.default = qsltDB;
