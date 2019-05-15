// QAE-1 Schema and Functions
// ==========================

/* Use Interfaces for Objects */

const implementjs 			= require('implement-js')
const implement 			= implementjs.default
const { Interface, type } 	= implementjs

const Big 		 			= require('big.js');



var qaeSchema = /** @class */ (function () 
{

	/* Vars */
	
	const QaeMasterAddress = "QjeTQp29p9xRvTcoox4chc6jQZAHwq87JC";

	const QaeTransactionType = {
	    "GENESIS": "GENESIS", 
	    "MINT": "MINT", 
	    "SEND": "SEND",
	    "BURN": "BURN"
	}
	
	/* Interfaces */

	const QaeTransactionOutput = Interface('QaeTransactionOutput')({
		schema_version: type('number'),
		address: type('string'),
		amount: type('string')
	},{
		error: true,
		strict: true
	})

	const QaeTransactionDetails = Interface('QaeTransactionDetails')({
		schema_version: type('number'),
    	transactionType: type('string'),
    	senderAddress: type('string'),
    	tokenIdHex: type('string'),
    	versionType: type('number'),
    	timestamp: type('string')||null,
    	timestamp_unix: type('number')||null,
    	symbol: type('string'),
    	name: type('string'),
    	documentUri: type('string'), 
    	decimals: type('number'),
    	genesisOrMintQuantity: type('string')||null,
    	sendOutput: type('object', QaeTransactionOutput)||null,
    	fee_xqr: type('string')
	},{
		error: true,
		strict: true
	})
	
	const QaeTokenStats = Interface('QaeTokenStats')({
		schema_version: type('number'),
    	block_created: type('number')||null,
    	block_last_active_send: type('number')||null,
    	block_last_active_mint: type('number')||null,
    	qty_valid_txns_since_genesis: type('number'),
    	qty_valid_token_addresses: type('number'),
    	qty_token_minted: type('string'),
    	qty_token_burned: type('string'),
    	qty_token_circulating_supply: type('string'),
    	qty_xqr_spent: type('string')
	},{
		error: true,
		strict: true
	})
	
	const QaeTokenObject = Interface('QaeTokenObject')({
		schema_version: type('number'),
		type: type('string'),
		tokenDetails: type('object', QaeTransactionDetails),
		tokenStats: type('object', QaeTokenStats),
		lastUpdatedBlock: type('number')
	},{
		error: true,
		strict: true
	})

	const QaeAddressObject = Interface('QaeAddressObject')({
		schema_version: type('number'),
    	recordId: type('string'),
    	address: type('string'),
    	tokenIdHex: type('string'),
    	isOwner: type('boolean'),
    	tokenBalance: type('number')
	},{
		error: true,
		strict: true
	})
	
	const QaeTransactionObject = Interface('QaeTransactionObject')({
		schema_version: type('number'),
    	txid: type('string'),
    	blockId: type('string')||null,
    	blockHeight: type('number')||null,
    	valid: type('boolean'),
    	invalidReason: type('string')||null,
    	tokenDetails: type('object', QaeTransactionDetails)||null
	},{
		error: true,
		strict: true
	})
	
	/* Functions */

    function qaeSchema() 
    {        	
        return this;
    }
    
    qaeSchema.prototype.getTransactionTypes = function ()
    {
        
    	return QaeTransactionType;
    
    };

    qaeSchema.prototype.reIndex = function (db)
    {
        




    
    };

    qaeSchema.prototype.parseTransaction = function (txdata)
    {
        
		console.log(txdata);



    
    };
    

	return qaeSchema;

}());

exports.default = qaeSchema;
