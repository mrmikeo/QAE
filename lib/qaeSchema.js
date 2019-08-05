// QAE-1 Schema and Functions
// ==========================

/* Use Interfaces for Objects */

const implementjs           = require('implement-js')
const implement             = implementjs.default
const { Interface, type }   = implementjs

const Big                   = require('big.js');
const crypto                = require('crypto');

var qaeSchema = /** @class */ (function () 
{

    /* Vars */
    
    const QaeMasterAddress = "QjeTQp29p9xRvTcoox4chc6jQZAHwq87JC";
    
    const activationHeight = 2859480;
	
    const mintableActivationHeight = 3718961;
    const pausableActivationHeight = 3718961;
    
    const schemaVersion = 13;

    const QaeTransactionType = {
        "GENESIS": "GENESIS", 
        "MINT": "MINT", 
        "SEND": "SEND",
        "BURN": "BURN",
        "PAUSE": "PAUSE",
        "RESUME": "RESUME",
        "NEWOWNER": "NEWOWNER"
    };
    
    const QaeTransactionTypeHeight = {
        "GENESIS": 2859480, 
        "MINT": 2859480, 
        "SEND": 2859480,
        "BURN": 2859480,
        "PAUSE": 2946200,
        "RESUME": 2946200,
        "NEWOWNER": 2946200
    };
	
    const QaeGenesisCostHeight = {
	1: 1,
	3800000: 100000000000
    };
	
    const DeniedTickers = ['XQR', 'BTC', 'LTC', 'BCH', 'ETH', "EOS', 'XRP', 'USDT', 'XMR', 'DASH', 'ETC'];
    
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
        timestamp: type('string'),
        timestamp_unix: type('number'),
        symbol: type('string'),
        name: type('string'),
        documentUri: type('string'), 
        decimals: type('number'),
        genesisOrMintQuantity: type('string'),
        sendOutput: type('object', QaeTransactionOutput),
        note: type('string'),
        amount_xqr: type('string'),
        fee_xqr: type('string')
    },{
        error: true,
        strict: true
    })
    
    const QaeTokenDetails = Interface('QaeTokenDetails')({
        schema_version: type('number'),
        ownerAddress: type('string'),
        tokenIdHex: type('string'),
        versionType: type('number'),
        genesis_timestamp: type('string'),
        genesis_timestamp_unix: type('number'),
        symbol: type('string'),
        name: type('string'),
        documentUri: type('string'), 
        decimals: type('number'),
        genesisQuantity: type('string'),
	pausable: type('boolean'),
	mintable: type('boolean')
    },{
        error: true,
        strict: true
    })
    
    const QaeTokenStats = Interface('QaeTokenStats')({
        schema_version: type('number'),
        block_created_height: type('number'),
        block_created_id: type('string'),
        block_last_active_send: type('number'),
        block_last_active_mint: type('number'),
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
        paused: type('boolean'),
        tokenDetails: type('object', QaeTokenDetails),
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
        tokenBalance: type('string'),
        tokenDecimals: type('number'),
        lastUpdatedBlock: type('number')
    },{
        error: true,
        strict: true
    })
    
    const QaeTransactionObject = Interface('QaeTransactionObject')({
        schema_version: type('number'),
        txid: type('string'),
        blockId: type('string'),
        blockHeight: type('number'),
        valid: type('boolean'),
        invalidReason: type('string'),
        transactionDetails: type('object', QaeTransactionDetails)
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

    qaeSchema.prototype.parseTransaction = function (txdata, bkdata, qdb)
    {
        
        return new Promise((resolve, reject) => {
        
            var transactionData = txdata;
            var blockData = bkdata;
            
            var vendorData = JSON.parse(txdata.vendorField);
        
            if (vendorData && vendorData.qae1 && blockData.height >= activationHeight)
            {
        
                var contractData = vendorData.qae1;
                
                // Some Error Checking
                
                var validationcheck = true;
                var invalidreason = '';
                
                /*
                
                    Token Variables:
                        * Creator Provided Vars
                            - decimals      (de)
                            - symbol        (sy)
                            - name          (na)
                            - quantity      (qt)
                            - documentUri   (du)
                            - type          (tp)
			    - note          (no)
			    - pausable      (pa)
			    - mintable      (mi)

                        * System Provided Vars
                            - tokenIdHex    (id)
                
                */
                
                if (!QaeTransactionType[contractData.tp]) //contractData.tp != 'GENESIS' && contractData.tp != 'MINT' && contractData.tp != 'BURN' && contractData.tp != 'SEND')
                {
                    // Invalid Type
                    
                    validationcheck = false;
                    invalidreason = 'Unknown Transaction Type';
                
                }
                
                if (QaeTransactionTypeHeight[contractData.tp] > blockData.height)
                {
                    // Invalid Type
                    
                    validationcheck = false;
                    invalidreason = 'Method not yet active';
                
                }

                // Let's set a maximum for the quantity field...
                var maxqt = new Big('10000000000000000000');
                
                
                if (contractData.tp == "GENESIS" || contractData.tp == "SEND" || contractData.tp == "MINT" || contractData.tp == "BURN")
                {
                
                    try {
                    
                        var testnumber = new Big(contractData.qt);
                    
                        if (testnumber.lt(1) || testnumber.gt(maxqt)) // || !Number.isInteger(contractData.qt))
                        {
                            // Quantity cannot be less than one and must me an integer

                            validationcheck = false;
                            invalidreason = 'Quantity cannot be less than one and must me an integer';
                
                        }
                    
                        
                    } catch (e) {
                    
                        // Quantity is not a number

                        validationcheck = false;
                        invalidreason = 'Quantity is not a number';
                    
                    }
                
                }
                
                if (contractData.tp == 'GENESIS')
                {

                    try {
                    
                        var testdigits = new Big(contractData.de);
                        
                    } catch (e) {
                    
                        // Digits is not a number

                        validationcheck = false;
                        invalidreason = 'Decimals must be a number';
                    
                    }
		
		    // Check Transaction Cost
		    var GenesisTransactionCost = new Big(1);
		    for(var costHeight in QaeGenesisCostHeight)
		    {
			console.log(costHeight + ": " + QaeGenesisCostHeight[costHeight]);
			    
			var bigCostHeight = new Big(costHeight);
			var bigTestHeight = new Big(blockData.height);
			if (bigTestHeight.gte(bigCostHeight))
			{
			    GenesisTransactionCost = new Big(QaeGenesisCostHeight[costHeight]);
			}
                    }

		    if (GenesisTransactionCost.gt(transactionData.amount))
		    {
                        validationcheck = false;
                        invalidreason = 'Generation Fee unsufficient.  ' + GenesisTransactionCost.toFixed(0) + ' units required';
		    }
                    
                    
                    if (!contractData.de || testdigits.lt(0) || testdigits.gt(8)) // || !Number.isInteger(contractData.de))
                    {
                        // Decimal formatting issue.  Should be a number between 0 and 8

                        validationcheck = false;
                        invalidreason = 'Decimal formatting issue.  Should be a number between 0 and 8';
                    
                    }
                    
                    if (contractData.sy.length < 3 || contractData.sy.length > 8)
                    {
                    
                        // Symbol (Ticker) size issue.  Should be a string between 3 and 8 characters
                    
                        validationcheck = false;
                        invalidreason = 'Symbol length issue.  Should be a string between 3 and 8 characters';
                    
                    }
			
		    if (DeniedTickers.indexOf(contractData.sy.toUpperCase()) > -1) 
		    {
                        validationcheck = false;
                        invalidreason = 'Symbol rejected.  This is a reserved ticker.';
		    }

                    if (contractData.na.length < 3 || contractData.na.length > 24)
                    {
                    
                        // Token name size issue.  Should be a string between 3 and 24 characters
                    
                        validationcheck = false;
                        invalidreason = 'Token name length issue.  Should be a string between 3 and 24 characters';
                    
                    }
                    
                    if (contractData.du && contractData.du.length > 32)
                    {
                    
                        // Document Uri size issue.  Should be a string no more than 32 characters, or it can be empty
                    
                        validationcheck = false;
                        invalidreason = 'Token document uri too long.  Should be empty or no more than 32 characters';

                    }

                    if (contractData.no && contractData.no.length > 32)
                    {
                    
                        // Note size issue.  Should be a string no more than 32 characters, or it can be empty
                    
                        validationcheck = false;
                        invalidreason = 'Note field too long.  Should be empty or no more than 32 characters';

                    }
			
                    if (contractData.pa && contractData.pa.toString() == "true")
                    {
                    	
                    	contractData.pa = true;
                   
                    }
                    else if (contractData.pa && contractData.pa.toString() == "false")
                    {
                    	
                    	contractData.pa = false;
                   
                    }
		    else
		    {
			if (pausableActivationHeight > blockData.height)
		    	{
			    contractData.pa = true;
			}
		   	else
			{
			    contractData.pa = false;
			}
		    }
			
                    if (contractData.mi && contractData.mi.toString() == "true")
                    {
                    	
                    	contractData.mi = true;
                   
                    }
                    else if (contractData.mi && contractData.mi.toString() == "false")
                    {
                    	
                    	contractData.mi = false;
                   
                    }
		    		else
		    		{
		       			if (mintableActivationHeight > blockData.height)
		       			{
		           			contractData.mi = true;
		       			}
		       			else
		       			{
                           	contractData.mi = false;
		       			}
		    		}
                
                }
                else if (!contractData.id)
                {

                    var regtest = /[0-9A-Fa-f]{6}/g;

                    if (!contractData.id)
                    {
                    
                        // ID variable is required for MINT, BURN, and SEND
                
                        validationcheck = false;
                        invalidreason = 'ID variable is required for MINT, BURN, and SEND';
                        
                    }
                    else if (!regtest.test(contractData.id))
                    {
                    
                        // ID variable should be a hexidecimal number
                        
                        validationcheck = false;
                        invalidreason = 'ID variable should be a hexidecimal number';
                                            
                    }
                
                }
                
                if (validationcheck === false)
                {


                    (async () => {

                        var TransactionOutput = {
                            schema_version: schemaVersion,
                            address: transactionData.sender,
                            amount: '0'
                        }

                        var TransactionDetails = {
                            schema_version: schemaVersion,
                            transactionType: 'ERROR',
                            senderAddress: transactionData.sender,
                            tokenIdHex: '',
                            versionType: 1,
                            timestamp: transactionData.timestamp.human,
                            timestamp_unix: transactionData.timestamp.unix,
                            symbol: '',
                            name: '',
                            documentUri: '', 
                            decimals: 0,
                            genesisOrMintQuantity: '0',
                            sendOutput: TransactionOutput,
                            note: '',
                            amount_xqr: transactionData.amount.toString(),
                            fee_xqr: transactionData.fee.toString()
                        }
                    
                        var TransactionObject = {
                            schema_version: schemaVersion,
                            txid: transactionData.id,
                            blockId: blockData.id,
                            blockHeight: blockData.height,
                            valid: false,
                            invalidReason: invalidreason,
                            transactionDetails: TransactionDetails
                        }

                        await qdb.insertDocuments('transactions', TransactionObject);
                                                    
                        resolve(false);
                    
                    })();

                }
                else
                {
                
                    // End Error Checking
                
                    if (contractData.tp == 'GENESIS' && transactionData.recipient == QaeMasterAddress)
                    {
                        // New Token Request
                    
                        var failed = false;

                        var genesisAmount = new Big(contractData.qt);

                        var TransactionOutput = {
                            schema_version: schemaVersion,
                            address: transactionData.sender,
                            amount: genesisAmount.toString()
                        }

                        try 
                        {
                    
                            implement(QaeTransactionOutput)(TransactionOutput);

                        } catch (e) {
                    
                            console.log(e);
                            failed = true;
                    
                        }
                    
                        var rawTokenId = 'QAE1.' + contractData.sy + '.' + blockData.height + '.' + transactionData.id;
                        var tokenId = crypto.createHash('md5').update(rawTokenId).digest('hex');
                    
                        var tSymbol = contractData.sy.toUpperCase();
                        var tName = contractData.na;
                    
                        var tDecimals = parseInt(contractData.de);
                    
                        if (contractData.du) tDocumentUri = contractData.du
                        else tDocumentUri = '';

                        var tNote = '';
                        if (contractData.no) tNote = contractData.no

                        var TransactionDetails = {
                            schema_version: schemaVersion,
                            transactionType: 'GENESIS',
                            senderAddress: transactionData.sender,
                            tokenIdHex: tokenId,
                            versionType: 1,
                            timestamp: transactionData.timestamp.human,
                            timestamp_unix: transactionData.timestamp.unix,
                            symbol: tSymbol,
                            name: tName,
                            documentUri: tDocumentUri, 
                            decimals: tDecimals,
                            genesisOrMintQuantity: genesisAmount.toString(),
                            sendOutput: TransactionOutput,
                            note: tNote,
                            amount_xqr: transactionData.amount.toString(),
                            fee_xqr: transactionData.fee.toString()
                        }

                        try 
                        {
                    
                            implement(QaeTransactionDetails)(TransactionDetails);

                        } catch (e) {
                    
                            console.log(e);
                            failed = true;
                    
                        }
                    
                        var TokenDetails = {
                            schema_version: schemaVersion,
                            ownerAddress: transactionData.sender,
                            tokenIdHex: tokenId,
                            versionType: 1,
                            genesis_timestamp: transactionData.timestamp.human,
                            genesis_timestamp_unix: transactionData.timestamp.unix,
                            symbol: tSymbol,
                            name: tName,
                            documentUri: tDocumentUri, 
                            decimals: tDecimals,
                            genesisQuantity: genesisAmount.toString(),
			    			pausable: contractData.pa,
			    			mintable: contractData.mi
                        }

                        try 
                        {
                    
                            implement(QaeTokenDetails)(TokenDetails);

                        } catch (e) {
                    
                            console.log(e);
                            failed = true;
                    
                        }


                    
                        var TokenStats = {
                            schema_version: schemaVersion,
                            block_created_height: blockData.height,
                            block_created_id: blockData.id,
                            block_last_active_send: 0,
                            block_last_active_mint: blockData.height,
                            qty_valid_txns_since_genesis: 0,
                            qty_valid_token_addresses: 1,
                            qty_token_minted: genesisAmount.toString(),
                            qty_token_burned: "0",
                            qty_token_circulating_supply: genesisAmount.toString(),
                            qty_xqr_spent: transactionData.amount.toString()
                        }
                    
                        try 
                        {
                    
                            implement(QaeTokenStats)(TokenStats);

                        } catch (e) {
                    
                            console.log(e);
                            failed = true;
                    
                        }



                        var TokenObject = {
                            schema_version: schemaVersion,
                            type: 'QAE1',
                            paused: false,
                            tokenDetails: TokenDetails,
                            tokenStats: TokenStats,
                            lastUpdatedBlock: blockData.height
                        }

                        try 
                        {
                    
                            implement(QaeTokenObject)(TokenObject);

                        } catch (e) {
                    
                            console.log(e);
                            failed = true;
                    
                        }

                        var rawRecordId = transactionData.sender + '.' + tokenId;
                        var recordId = crypto.createHash('md5').update(rawRecordId).digest('hex');
                    
                        var AddressObject = {
                            schema_version: schemaVersion,
                            recordId: recordId,
                            address: transactionData.sender,
                            tokenIdHex: tokenId,
                            isOwner: true,
                            tokenBalance: genesisAmount.toString(),
                            tokenDecimals: tDecimals,
                            lastUpdatedBlock: blockData.height
                        }

                        try 
                        {
                    
                            implement(QaeAddressObject)(AddressObject);

                        } catch (e) {
                    
                            console.log(e);
                            failed = true;
                    
                        }
                    
                    
                        var TransactionObject = {
                            schema_version: schemaVersion,
                            txid: transactionData.id,
                            blockId: blockData.id,
                            blockHeight: blockData.height,
                            valid: true,
                            invalidReason: '',
                            transactionDetails: TransactionDetails
                        }
                    
                        try 
                        {
                    
                            implement(QaeTransactionObject)(TransactionObject);

                        } catch (e) {
                    
                            console.log(e);
                            failed = true;
                    
                        }
                    
                        console.log('-------------------------------------');
                        console.log('Token Object');
                        console.log(TokenObject);
                        console.log('Address Object');
                        console.log(AddressObject);
                        console.log('Transaction Object');
                        console.log(TransactionObject);
                        console.log('-------------------------------------');
                    
                        if (failed === false)
                        {
                    
                            (async () => {
                        
                                //var mclient = await qdb.connect();
                                //qdb.setClient(mclient);
                    
                                await qdb.insertDocuments('tokens', TokenObject);
                                await qdb.insertDocuments('addresses', AddressObject);
                                await qdb.insertDocuments('transactions', TransactionObject);
                            
                                //await qdb.close();
                            
                                resolve(true);
                    
                            })();
                        
                        }
                        else
                        {

                            var TransactionOutput = {
                                schema_version: schemaVersion,
                                address: transactionData.sender,
                                amount: "0"
                            }

                            var TransactionDetails = {
                                schema_version: schemaVersion,
                                transactionType: 'GENESIS',
                                senderAddress: transactionData.sender,
                                tokenIdHex: null,
                                versionType: 1,
                                timestamp: transactionData.timestamp.human,
                                timestamp_unix: transactionData.timestamp.unix,
                                symbol: tSymbol,
                                name: tName,
                                documentUri: tDocumentUri, 
                                decimals: tDecimals,
                                genesisOrMintQuantity: "0",
                                sendOutput: TransactionOutput,
                                note: tNote,
                                amount_xqr: transactionData.amount.toString(),
                                fee_xqr: transactionData.fee.toString()
                            }

                            var TransactionObject = {
                                schema_version: schemaVersion,
                                txid: transactionData.id,
                                blockId: blockData.id,
                                blockHeight: blockData.height,
                                valid: false,
                                invalidReason: 'Token Genesis Failed',
                                transactionDetails: TransactionDetails
                            }

                            (async () => {
                        
                                //var mclient = await qdb.connect();
                                //qdb.setClient(mclient);

                                await qdb.insertDocuments('transactions', TransactionObject);
                            
                                //await qdb.close();
                            
                                resolve(false);
                    
                            })();
                                                
                        }
                    
                    }
                    else if (contractData.tp == 'MINT' && transactionData.recipient == QaeMasterAddress)
                    {
                        // Mint more tokens
                    
                        (async () => {

                            var failed = false;

                            var mintAmount = new Big(contractData.qt);

                            var tokenId = contractData.id;
                            
                            var tNote = '';
                            if (contractData.no) tNote = contractData.no

                            var TransactionOutput = {
                                schema_version: schemaVersion,
                                address: transactionData.sender,
                                amount: mintAmount.toString()
                            }

                            try 
                            {
                    
                                implement(QaeTransactionOutput)(TransactionOutput);

                            } catch (e) {
                    
                                console.log(e);
                                failed = true;
                    
                            }
                    
                            var findToken = await qdb.findDocument('tokens', {"tokenDetails.tokenIdHex": tokenId});
                    
                            // Check if it actually exists
                            if (findToken == null)
                            {

                                var tSymbol = null;
                                var tName = null;
                                var tDocumentUri = null;
                                var tDecimals = 0;
                        
                                var TransactionOutput = {
                                    schema_version: schemaVersion,
                                    address: transactionData.sender,
                                    amount: "0"
                                }

                                var TransactionDetails = {
                                    schema_version: schemaVersion,
                                    transactionType: 'MINT',
                                    senderAddress: transactionData.sender,
                                    tokenIdHex: tokenId,
                                    versionType: 1,
                                    timestamp: transactionData.timestamp.human,
                                    timestamp_unix: transactionData.timestamp.unix,
                                    symbol: tSymbol,
                                    name: tName,
                                    documentUri: tDocumentUri, 
                                    decimals: tDecimals,
                                    genesisOrMintQuantity: "0",
                                    sendOutput: TransactionOutput,
                                    note: tNote,
                                    amount_xqr: transactionData.amount.toString(),
                                    fee_xqr: transactionData.fee.toString()
                                }

                                var TransactionObject = {
                                    schema_version: schemaVersion,
                                    txid: transactionData.id,
                                    blockId: blockData.id,
                                    blockHeight: blockData.height,
                                    valid: false,
                                    invalidReason: 'Token Mint Failed - Token Does Not Exist',
                                    transactionDetails: TransactionDetails
                                }

                                await qdb.insertDocuments('transactions', TransactionObject);
                            
                                console.log('Token does not exist');
                            
                                resolve(false);
                                
                            }
                            else if (findToken.tokenDetails.ownerAddress != transactionData.sender)
                            {

                                var tSymbol = findToken.tokenDetails.symbol;
                                var tName = findToken.tokenDetails.name;
                                var tDocumentUri = findToken.tokenDetails.documentUri;
                                var tDecimals = findToken.tokenDetails.decimals;
                        
                                var TransactionOutput = {
                                    schema_version: schemaVersion,
                                    address: transactionData.sender,
                                    amount: "0"
                                }

                                var TransactionDetails = {
                                    schema_version: schemaVersion,
                                    transactionType: 'MINT',
                                    senderAddress: transactionData.sender,
                                    tokenIdHex: tokenId,
                                    versionType: 1,
                                    timestamp: transactionData.timestamp.human,
                                    timestamp_unix: transactionData.timestamp.unix,
                                    symbol: tSymbol,
                                    name: tName,
                                    documentUri: tDocumentUri, 
                                    decimals: tDecimals,
                                    genesisOrMintQuantity: "0",
                                    sendOutput: TransactionOutput,
                                    note: tNote,
                                    amount_xqr: transactionData.amount.toString(),
                                    fee_xqr: transactionData.fee.toString()
                                }

                                var TransactionObject = {
                                    schema_version: schemaVersion,
                                    txid: transactionData.id,
                                    blockId: blockData.id,
                                    blockHeight: blockData.height,
                                    valid: false,
                                    invalidReason: 'Token Mint Failed - Not Owner',
                                    transactionDetails: TransactionDetails
                                }
                        
                                await qdb.insertDocuments('transactions', TransactionObject);
                            
                                console.log('Mint failed:  Not the token owner');
                            
                                resolve(false);
                            
                            }
                            else if (findToken.tokenDetails.mintable != true)
                            {

                                var tSymbol = findToken.tokenDetails.symbol;
                                var tName = findToken.tokenDetails.name;
                                var tDocumentUri = findToken.tokenDetails.documentUri;
                                var tDecimals = findToken.tokenDetails.decimals;
                        
                                var TransactionOutput = {
                                    schema_version: schemaVersion,
                                    address: transactionData.sender,
                                    amount: "0"
                                }

                                var TransactionDetails = {
                                    schema_version: schemaVersion,
                                    transactionType: 'MINT',
                                    senderAddress: transactionData.sender,
                                    tokenIdHex: tokenId,
                                    versionType: 1,
                                    timestamp: transactionData.timestamp.human,
                                    timestamp_unix: transactionData.timestamp.unix,
                                    symbol: tSymbol,
                                    name: tName,
                                    documentUri: tDocumentUri, 
                                    decimals: tDecimals,
                                    genesisOrMintQuantity: "0",
                                    sendOutput: TransactionOutput,
                                    note: tNote,
                                    amount_xqr: transactionData.amount.toString(),
                                    fee_xqr: transactionData.fee.toString()
                                }

                                var TransactionObject = {
                                    schema_version: schemaVersion,
                                    txid: transactionData.id,
                                    blockId: blockData.id,
                                    blockHeight: blockData.height,
                                    valid: false,
                                    invalidReason: 'Token Mint Failed - Not Mintable',
                                    transactionDetails: TransactionDetails
                                }

                                await qdb.insertDocuments('transactions', TransactionObject);

                                console.log('Mint failed:  Not mintable');
                            
                                resolve(false);
                            
                            }
                            else if (findToken.paused == true)
                            {

                                var tSymbol = findToken.tokenDetails.symbol;
                                var tName = findToken.tokenDetails.name;
                                var tDocumentUri = findToken.tokenDetails.documentUri;
                                var tDecimals = findToken.tokenDetails.decimals;
                        
                                var TransactionOutput = {
                                    schema_version: schemaVersion,
                                    address: transactionData.sender,
                                    amount: "0"
                                }

                                var TransactionDetails = {
                                    schema_version: schemaVersion,
                                    transactionType: 'MINT',
                                    senderAddress: transactionData.sender,
                                    tokenIdHex: tokenId,
                                    versionType: 1,
                                    timestamp: transactionData.timestamp.human,
                                    timestamp_unix: transactionData.timestamp.unix,
                                    symbol: tSymbol,
                                    name: tName,
                                    documentUri: tDocumentUri, 
                                    decimals: tDecimals,
                                    genesisOrMintQuantity: "0",
                                    sendOutput: TransactionOutput,
                                    note: tNote,
                                    amount_xqr: transactionData.amount.toString(),
                                    fee_xqr: transactionData.fee.toString()
                                }

                                var TransactionObject = {
                                    schema_version: schemaVersion,
                                    txid: transactionData.id,
                                    blockId: blockData.id,
                                    blockHeight: blockData.height,
                                    valid: false,
                                    invalidReason: 'Token Mint Failed - Token is Paused',
                                    transactionDetails: TransactionDetails
                                }

                                await qdb.insertDocuments('transactions', TransactionObject);

                                console.log('Mint failed:  Token is paused');
                            
                                resolve(false);
                            
                            }
                            else
                            {
                            
                                // It's ok

                                var tSymbol = findToken.tokenDetails.symbol;
                                var tName = findToken.tokenDetails.name;
                                var tDocumentUri = findToken.tokenDetails.documentUri;
                                var tDecimals = findToken.tokenDetails.decimals;
                    

                                var TransactionDetails = {
                                    schema_version: schemaVersion,
                                    transactionType: 'MINT',
                                    senderAddress: transactionData.sender,
                                    tokenIdHex: tokenId,
                                    versionType: 1,
                                    timestamp: transactionData.timestamp.human,
                                    timestamp_unix: transactionData.timestamp.unix,
                                    symbol: tSymbol,
                                    name: tName,
                                    documentUri: tDocumentUri, 
                                    decimals: tDecimals,
                                    genesisOrMintQuantity: mintAmount.toString(),
                                    sendOutput: TransactionOutput,
                                    note: tNote,
                                    amount_xqr: transactionData.amount.toString(),
                                    fee_xqr: transactionData.fee.toString()
                                }

                                try 
                                {
                    
                                    implement(QaeTransactionDetails)(TransactionDetails);

                                } catch (e) {
                                        
                                    console.log(e);
                                    failed = true;
                    
                                }


                                var TransactionObject = {
                                    schema_version: schemaVersion,
                                    txid: transactionData.id,
                                    blockId: blockData.id,
                                    blockHeight: blockData.height,
                                    valid: true,
                                    invalidReason: '',
                                    transactionDetails: TransactionDetails
                                }
                    
                                try 
                                {

                                    implement(QaeTransactionObject)(TransactionObject);

                                } catch (e) {
                    
                                    console.log(e);
                                    failed = true;
                    
                                }
                    
                                console.log('-------------------------------------');
                                console.log('Transaction Object');
                                console.log(TransactionObject);
                                console.log('-------------------------------------');
                        
                                if (failed === false)
                                {

                                    var rawRecordId = transactionData.sender + '.' + tokenId;
                                    var recordId = crypto.createHash('md5').update(rawRecordId).digest('hex');
                            
                                    var findAddress = await qdb.findDocument('addresses', {"recordId": recordId});
                                    if (findAddress == null)
                                    {

                                        var TransactionOutput = {
                                            schema_version: schemaVersion,
                                            address: transactionData.sender,
                                            amount: "0"
                                        }

                                        var TransactionDetails = {
                                            schema_version: schemaVersion,
                                            transactionType: 'MINT',
                                            senderAddress: transactionData.sender,
                                            tokenIdHex: tokenId,
                                            versionType: 1,
                                            timestamp: transactionData.timestamp.human,
                                            timestamp_unix: transactionData.timestamp.unix,
                                            symbol: tSymbol,
                                            name: tName,
                                            documentUri: tDocumentUri, 
                                            decimals: tDecimals,
                                            genesisOrMintQuantity: "0",
                                            sendOutput: TransactionOutput,
                                            note: tNote,
                                            amount_xqr: transactionData.amount.toString(),
                                            fee_xqr: transactionData.fee.toString()
                                        }

                                        var TransactionObject = {
                                            schema_version: schemaVersion,
                                            txid: transactionData.id,
                                            blockId: blockData.id,
                                            blockHeight: blockData.height,
                                            valid: false,
                                            invalidReason: 'Token Mint Failed - Address Not Found',
                                            transactionDetails: TransactionDetails
                                        }

                                        await qdb.insertDocuments('transactions', TransactionObject);

                                        console.log('Error: Mint to addresses not found');
                                
                                        resolve(false);
                            
                                    }
                                    else
                                    {
                                
                                        await qdb.insertDocuments('transactions', TransactionObject);

                                        var senderbalance = await qdb.findDocumentBigSum('transactions', {"transactionDetails.tokenIdHex": tokenId, "valid": true, "transactionDetails.sendOutput.address": findAddress.address}, 'transactionDetails.sendOutput.amount');

                                        var senderbalancesend = await qdb.findDocumentBigSum('transactions', {"transactionDetails.tokenIdHex": tokenId, "valid": true, "transactionDetails.senderAddress": findAddress.address, "transactionDetails.transactionType": "SEND"}, 'transactionDetails.sendOutput.amount');

                                        var totalsenderbalance = new Big(senderbalance).minus(senderbalancesend);

                                        await qdb.updateDocument('addresses', {"recordId": recordId }, {"tokenBalance": totalsenderbalance.toString(), "lastUpdatedBlock": blockData.height });
                            
                                        var newValidTxns = await qdb.findDocumentCount('transactions', {"transactionDetails.tokenIdHex": tokenId, "valid": true });
                            
                                        var totalMinted = new Big(findToken.tokenStats.qty_token_minted).plus(mintAmount);
                                        var circSupply = new Big(findToken.tokenStats.qty_token_circulating_supply).plus(mintAmount);                           
                            
                                        var xqrspent = await qdb.findDocumentBigSum('transactions', {"transactionDetails.tokenIdHex": tokenId}, 'transactionDetails.amount_xqr');
                            
                                        await qdb.updateDocument('tokens', {"tokenDetails.tokenIdHex":  tokenId }, {"lastUpdatedBlock": blockData.height, "tokenStats.block_last_active_mint": blockData.height, "tokenStats.qty_valid_txns_since_genesis": newValidTxns, "tokenStats.qty_token_minted": totalMinted.toString(), "tokenStats.qty_token_circulating_supply": circSupply.toString(), "tokenStats.qty_xqr_spent": xqrspent.toString()});
                            
                                        resolve(true);
                                    
                                    }
                                            
                                }
                                else
                                {

                                    var TransactionOutput = {
                                        schema_version: schemaVersion,
                                        address: transactionData.sender,
                                        amount: "0"
                                    }

                                    var TransactionDetails = {
                                        schema_version: schemaVersion,
                                        transactionType: 'MINT',
                                        senderAddress: transactionData.sender,
                                        tokenIdHex: tokenId,
                                        versionType: 1,
                                        timestamp: transactionData.timestamp.human,
                                        timestamp_unix: transactionData.timestamp.unix,
                                        symbol: tSymbol,
                                        name: tName,
                                        documentUri: tDocumentUri, 
                                        decimals: tDecimals,
                                        genesisOrMintQuantity: "0",
                                        sendOutput: TransactionOutput,
                                        note: tNote,
                                        amount_xqr: transactionData.amount.toString(),
                                        fee_xqr: transactionData.fee.toString()
                                    }

                                    var TransactionObject = {
                                        schema_version: schemaVersion,
                                        txid: transactionData.id,
                                        blockId: blockData.id,
                                        blockHeight: blockData.height,
                                        valid: false,
                                        invalidReason: 'Token Mint Failed - General Error',
                                        transactionDetails: TransactionDetails
                                    }

                                    await qdb.insertDocuments('transactions', TransactionObject);

                                    resolve(false);
                        
                                }
                            
                            }
                    
                        })();
                
                    }
                    else if (contractData.tp == 'SEND')
                    {
                        // Send tokens to another address
                    
                        (async () => {
                    
                            var failed = false;

                            var sendAmount = new Big(contractData.qt);

                            var tokenId = contractData.id;
                            
                            var tNote = '';
                            if (contractData.no) tNote = contractData.no
                    
                            var TransactionOutput = {
                                schema_version: schemaVersion,
                                address: transactionData.recipient,
                                amount: sendAmount.toString()
                            }

                            try 
                            {
                    
                                implement(QaeTransactionOutput)(TransactionOutput);

                            } catch (e) {
                        
                                console.log(e);
                                failed = true;
                    
                            }

                            var findToken = await qdb.findDocument('tokens', {"tokenDetails.tokenIdHex": tokenId});

                            // Check if it actually exists
                            
                            if (findToken == null)
                            {

                                var tSymbol = null;
                                var tName = null;
                                var tDocumentUri = null;
                                var tDecimals = 0;
                        
                                var TransactionOutput = {
                                    schema_version: schemaVersion,
                                    address: transactionData.recipient,
                                    amount: "0"
                                }

                                var TransactionDetails = {
                                    schema_version: schemaVersion,
                                    transactionType: 'SEND',
                                    senderAddress: transactionData.sender,
                                    tokenIdHex: tokenId,
                                    versionType: 1,
                                    timestamp: transactionData.timestamp.human,
                                    timestamp_unix: transactionData.timestamp.unix,
                                    symbol: tSymbol,
                                    name: tName,
                                    documentUri: tDocumentUri, 
                                    decimals: tDecimals,
                                    genesisOrMintQuantity: "0",
                                    sendOutput: TransactionOutput,
                                    note: tNote,
                                    amount_xqr: transactionData.amount.toString(),
                                    fee_xqr: transactionData.fee.toString()
                                }

                                var TransactionObject = {
                                    schema_version: schemaVersion,
                                    txid: transactionData.id,
                                    blockId: blockData.id,
                                    blockHeight: blockData.height,
                                    valid: false,
                                    invalidReason: 'Token Send Failed - Token Does Not Exist',
                                    transactionDetails: TransactionDetails
                                }

                                await qdb.insertDocuments('transactions', TransactionObject);

                                console.log('Token does not exist');
                            
                                resolve(false);
                            
                            }
                            else
                            {
                            
                            
                                var tSymbol = findToken.tokenDetails.symbol;
                                var tName = findToken.tokenDetails.name;
                                var tDocumentUri = findToken.tokenDetails.documentUri;
                                var tDecimals = findToken.tokenDetails.decimals;
                    

                                var TransactionDetails = {
                                    schema_version: schemaVersion,
                                    transactionType: 'SEND',
                                    senderAddress: transactionData.sender,
                                    tokenIdHex: tokenId,
                                    versionType: 1,
                                    timestamp: transactionData.timestamp.human,
                                    timestamp_unix: transactionData.timestamp.unix,
                                    symbol: tSymbol,
                                    name: tName,
                                    documentUri: tDocumentUri, 
                                    decimals: tDecimals,
                                    genesisOrMintQuantity: "0",
                                    sendOutput: TransactionOutput,
                                    note: tNote,
                                    amount_xqr: transactionData.amount.toString(),
                                    fee_xqr: transactionData.fee.toString()
                                }

                                try 
                                {
                    
                                    implement(QaeTransactionDetails)(TransactionDetails);

                                } catch (e) {
                    
                                    console.log(e);
                                    failed = true;
                    
                                }


                                var TransactionObject = {
                                    schema_version: schemaVersion,
                                    txid: transactionData.id,
                                    blockId: blockData.id,
                                    blockHeight: blockData.height,
                                    valid: true,
                                    invalidReason: '',
                                    transactionDetails: TransactionDetails
                                }
                    
                                try 
                                {
                    
                                    implement(QaeTransactionObject)(TransactionObject);

                                } catch (e) {
                        
                                    console.log(e);
                                    failed = true;
                    
                                }
                    
                                console.log('-------------------------------------');
                                console.log('Transaction Object');
                                console.log(TransactionObject);
                                console.log('-------------------------------------');
                    
                                if (failed === false)
                                {
                                            
                                    //var mclient = await qdb.connect();
                                    //qdb.setClient(mclient);
                            
                                    // Sender //

                                    var srawRecordId = transactionData.sender + '.' + tokenId;
                                    var srecordId = crypto.createHash('md5').update(srawRecordId).digest('hex');
                            
                                    var findSenderAddress = await qdb.findDocument('addresses', {"recordId": srecordId});
                                    if (findSenderAddress == null)
                                    {

                                        var TransactionOutput = {
                                            schema_version: schemaVersion,
                                            address: transactionData.recipient,
                                            amount: "0"
                                        }

                                        var TransactionDetails = {
                                            schema_version: schemaVersion,
                                            transactionType: 'SEND',
                                            senderAddress: transactionData.sender,
                                            tokenIdHex: tokenId,
                                            versionType: 1,
                                            timestamp: transactionData.timestamp.human,
                                            timestamp_unix: transactionData.timestamp.unix,
                                            symbol: tSymbol,
                                            name: tName,
                                            documentUri: tDocumentUri, 
                                            decimals: tDecimals,
                                            genesisOrMintQuantity: "0",
                                            sendOutput: TransactionOutput,
                                            note: tNote,
                                            amount_xqr: transactionData.amount.toString(),
                                            fee_xqr: transactionData.fee.toString()
                                        }

                                        var TransactionObject = {
                                            schema_version: schemaVersion,
                                            txid: transactionData.id,
                                            blockId: blockData.id,
                                            blockHeight: blockData.height,
                                            valid: false,
                                            invalidReason: 'Token Send Failed - Sender Address Not Found',
                                            transactionDetails: TransactionDetails
                                        }

                                        await qdb.insertDocuments('transactions', TransactionObject);

                                        console.log('Error: Sender addresses not found');
                                
                                        resolve(false);
                            
                                    }
                                    else if (new Big(findSenderAddress.tokenBalance).lt(sendAmount))
                                    {

                                        var TransactionOutput = {
                                            schema_version: schemaVersion,
                                            address: transactionData.recipient,
                                            amount: "0"
                                        }

                                        var TransactionDetails = {
                                            schema_version: schemaVersion,
                                            transactionType: 'SEND',
                                            senderAddress: transactionData.sender,
                                            tokenIdHex: tokenId,
                                            versionType: 1,
                                            timestamp: transactionData.timestamp.human,
                                            timestamp_unix: transactionData.timestamp.unix,
                                            symbol: tSymbol,
                                            name: tName,
                                            documentUri: tDocumentUri, 
                                            decimals: tDecimals,
                                            genesisOrMintQuantity: "0",
                                            sendOutput: TransactionOutput,
                                            note: tNote,
                                            amount_xqr: transactionData.amount.toString(),
                                            fee_xqr: transactionData.fee.toString()
                                        }

                                        var TransactionObject = {
                                            schema_version: schemaVersion,
                                            txid: transactionData.id,
                                            blockId: blockData.id,
                                            blockHeight: blockData.height,
                                            valid: false,
                                            invalidReason: 'Token Send Failed - Insufficient Funds',
                                            transactionDetails: TransactionDetails
                                        }

                                        await qdb.insertDocuments('transactions', TransactionObject);

                                        console.log('Error: Sender does not have enough funds');
                                
                                        resolve(false);
                            
                                    }
                                    else if (findToken.paused == true)
                                    {

                                        var TransactionOutput = {
                                            schema_version: schemaVersion,
                                            address: transactionData.recipient,
                                            amount: "0"
                                        }

                                        var TransactionDetails = {
                                            schema_version: schemaVersion,
                                            transactionType: 'SEND',
                                            senderAddress: transactionData.sender,
                                            tokenIdHex: tokenId,
                                            versionType: 1,
                                            timestamp: transactionData.timestamp.human,
                                            timestamp_unix: transactionData.timestamp.unix,
                                            symbol: tSymbol,
                                            name: tName,
                                            documentUri: tDocumentUri, 
                                            decimals: tDecimals,
                                            genesisOrMintQuantity: "0",
                                            sendOutput: TransactionOutput,
                                            note: tNote,
                                            amount_xqr: transactionData.amount.toString(),
                                            fee_xqr: transactionData.fee.toString()
                                        }

                                        var TransactionObject = {
                                            schema_version: schemaVersion,
                                            txid: transactionData.id,
                                            blockId: blockData.id,
                                            blockHeight: blockData.height,
                                            valid: false,
                                            invalidReason: 'Token Send Failed - Token is Paused',
                                            transactionDetails: TransactionDetails
                                        }

                                        await qdb.insertDocuments('transactions', TransactionObject);

                                        console.log('Error: Token is paused');
                                
                                        resolve(false);
                            
                                    }
                                    else
                                    {
                            
                                        await qdb.insertDocuments('transactions', TransactionObject);
                            
                                        var senderbalance = await qdb.findDocumentBigSum('transactions', {"transactionDetails.tokenIdHex": tokenId, "valid": true, "transactionDetails.sendOutput.address": findSenderAddress.address}, 'transactionDetails.sendOutput.amount');

                                        var senderbalancesend = await qdb.findDocumentBigSum('transactions', {"transactionDetails.tokenIdHex": tokenId, "valid": true, "transactionDetails.senderAddress": findSenderAddress.address, "transactionDetails.transactionType": "SEND"}, 'transactionDetails.sendOutput.amount');

                                        var totalsenderbalance = new Big(senderbalance).minus(senderbalancesend);
                
                                        await qdb.updateDocument('addresses', {"recordId": srecordId }, {"tokenBalance": totalsenderbalance.toString(), "lastUpdatedBlock": blockData.height });
                            
                                        // Recipient
                            
                                        var rrawRecordId = transactionData.recipient + '.' + tokenId;
                                        var rrecordId = crypto.createHash('md5').update(rrawRecordId).digest('hex');
                            
                                        var findRecipientAddress = await qdb.findDocument('addresses', {"recordId": rrecordId});
                                        if (findRecipientAddress == null)
                                        {
                            
                                            // Create New Record
                                                                
                                            var AddressObject = {
                                                schema_version: schemaVersion,
                                                recordId: rrecordId,
                                                address: transactionData.recipient,
                                                tokenIdHex: tokenId,
                                                isOwner: false,
                                                tokenBalance: sendAmount.toString(),
                                                tokenDecimals: tDecimals,
                                                lastUpdatedBlock: blockData.height
                                            }

                                            try 
                                            {
                    
                                                implement(QaeAddressObject)(AddressObject);

                                            } catch (e) {
                    
                                                console.log(e);
                    
                                            }
                                
                                            await qdb.insertDocuments('addresses', AddressObject);
                                                                
                                        }
                                        else 
                                        {
                            
                                            // Update Record
                            
                                        	var senderbalance = await qdb.findDocumentBigSum('transactions', {"transactionDetails.tokenIdHex": tokenId, "valid": true, "transactionDetails.sendOutput.address": findRecipientAddress.address}, 'transactionDetails.sendOutput.amount');
	
    	                                    var senderbalancesend = await qdb.findDocumentBigSum('transactions', {"transactionDetails.tokenIdHex": tokenId, "valid": true, "transactionDetails.senderAddress": findRecipientAddress.address, "transactionDetails.transactionType": "SEND"}, 'transactionDetails.sendOutput.amount');

    	                                    var totalsenderbalance = new Big(senderbalance).minus(senderbalancesend);

                                            await qdb.updateDocument('addresses', {"recordId": rrecordId }, {"tokenBalance": totalsenderbalance.toString(), "lastUpdatedBlock": blockData.height });
                                
                                        }
                            
                            
                            
                                        var newTokenAddrs = await qdb.findDocumentCount('addresses', {"tokenIdHex": tokenId });

                                        var newValidTxns = await qdb.findDocumentCount('transactions', {"transactionDetails.tokenIdHex": tokenId, "valid": true });

                                        var xqrspent = await qdb.findDocumentBigSum('transactions', {"transactionDetails.tokenIdHex": tokenId}, 'transactionDetails.amount_xqr');
                            
                                        await qdb.updateDocument('tokens', {"tokenDetails.tokenIdHex": tokenId }, {"lastUpdatedBlock": blockData.height, "tokenStats.block_last_active_send": blockData.height, "tokenStats.qty_valid_txns_since_genesis": newValidTxns, "tokenStats.qty_valid_token_addresses": newTokenAddrs, "tokenStats.qty_xqr_spent": xqrspent.toString() });

                                        resolve(true);
                                    
                                    }
                                            
                                }
                                else
                                {

                                    var TransactionOutput = {
                                        schema_version: schemaVersion,
                                        address: transactionData.recipient,
                                        amount: "0"
                                    }

                                    var TransactionDetails = {
                                        schema_version: schemaVersion,
                                        transactionType: 'SEND',
                                        senderAddress: transactionData.sender,
                                        tokenIdHex: tokenId,
                                        versionType: 1,
                                        timestamp: transactionData.timestamp.human,
                                        timestamp_unix: transactionData.timestamp.unix,
                                        symbol: tSymbol,
                                        name: tName,
                                        documentUri: tDocumentUri, 
                                        decimals: tDecimals,
                                        genesisOrMintQuantity: "0",
                                        sendOutput: TransactionOutput,
                                        note: tNote,
                                        amount_xqr: transactionData.amount.toString(),
                                        fee_xqr: transactionData.fee.toString()
                                    }

                                    var TransactionObject = {
                                        schema_version: schemaVersion,
                                        txid: transactionData.id,
                                        blockId: blockData.id,
                                        blockHeight: blockData.height,
                                        valid: false,
                                        invalidReason: 'Token Send Failed - General Error',
                                        transactionDetails: TransactionDetails
                                    }

                                    await qdb.insertDocuments('transactions', TransactionObject);

                                    resolve(false);
                        
                                }
                            
                            }
                    
                        })();
                
                    }
                    else if (contractData.tp == 'BURN' && transactionData.recipient == QaeMasterAddress)
                    {
                        // Burn tokens
                    
                        (async () => {

                            var failed = false;

                            var burnAmount = new Big(contractData.qt).times(-1);
                            var absBurnAmount = new Big(contractData.qt);

                            var tokenId = contractData.id;
                            
                            var tNote = '';
                            if (contractData.no) tNote = contractData.no
                    
                            var TransactionOutput = {
                                schema_version: schemaVersion,
                                address: transactionData.sender,
                                amount: burnAmount.toString()
                            }

                            try 
                            {
                    
                                implement(QaeTransactionOutput)(TransactionOutput);

                            } catch (e) {
                    
                                console.log(e);
                                failed = true;
                    
                            }
                    
                            var findToken = await qdb.findDocument('tokens', {"tokenDetails.tokenIdHex": tokenId});
    
                            var srawRecordId = transactionData.sender + '.' + tokenId;
                            var srecordId = crypto.createHash('md5').update(srawRecordId).digest('hex');
                            
                            var findSenderAddress = await qdb.findDocument('addresses', {"recordId": srecordId});

                            // Check if it actually exists
                            
                            if (findToken == null)
                            {

                                var tSymbol = null;
                                var tName = null;
                                var tDocumentUri = null;
                                var tDecimals = 0;
                        
                                var TransactionOutput = {
                                    schema_version: schemaVersion,
                                    address: transactionData.sender,
                                    amount: "0"
                                }

                                var TransactionDetails = {
                                    schema_version: schemaVersion,
                                    transactionType: 'BURN',
                                    senderAddress: transactionData.sender,
                                    tokenIdHex: tokenId,
                                    versionType: 1,
                                    timestamp: transactionData.timestamp.human,
                                    timestamp_unix: transactionData.timestamp.unix,
                                    symbol: tSymbol,
                                    name: tName,
                                    documentUri: tDocumentUri, 
                                    decimals: tDecimals,
                                    genesisOrMintQuantity: "0",
                                    sendOutput: TransactionOutput,
                                    note: tNote,
                                    amount_xqr: transactionData.amount.toString(),
                                    fee_xqr: transactionData.fee.toString()
                                }

                                var TransactionObject = {
                                    schema_version: schemaVersion,
                                    txid: transactionData.id,
                                    blockId: blockData.id,
                                    blockHeight: blockData.height,
                                    valid: false,
                                    invalidReason: 'Token Burn Failed - Token Does Not Exist',
                                    transactionDetails: TransactionDetails
                                }

                                await qdb.insertDocuments('transactions', TransactionObject);

                                console.log('Token does not exist');
                            
                                resolve(false);
                            
                            }
                            else if (findToken.tokenDetails.ownerAddress != transactionData.sender)
                            {

                                var tSymbol = findToken.tokenDetails.symbol;
                                var tName = findToken.tokenDetails.name;
                                var tDocumentUri = findToken.tokenDetails.documentUri;
                                var tDecimals = findToken.tokenDetails.decimals;
                        
                                var TransactionOutput = {
                                    schema_version: schemaVersion,
                                    address: transactionData.sender,
                                    amount: "0"
                                }

                                var TransactionDetails = {
                                    schema_version: schemaVersion,
                                    transactionType: 'BURN',
                                    senderAddress: transactionData.sender,
                                    tokenIdHex: tokenId,
                                    versionType: 1,
                                    timestamp: transactionData.timestamp.human,
                                    timestamp_unix: transactionData.timestamp.unix,
                                    symbol: tSymbol,
                                    name: tName,
                                    documentUri: tDocumentUri, 
                                    decimals: tDecimals,
                                    genesisOrMintQuantity: "0",
                                    sendOutput: TransactionOutput,
                                    note: tNote,
                                    amount_xqr: transactionData.amount.toString(),
                                    fee_xqr: transactionData.fee.toString()
                                }

                                var TransactionObject = {
                                    schema_version: schemaVersion,
                                    txid: transactionData.id,
                                    blockId: blockData.id,
                                    blockHeight: blockData.height,
                                    valid: false,
                                    invalidReason: 'Token Burn Failed - Not Owner',
                                    transactionDetails: TransactionDetails
                                }

                                await qdb.insertDocuments('transactions', TransactionObject);

                                console.log('Burn failed:  Not the token owner');
                            
                                resolve(false);
                            
                            }
                            else if (findToken.paused == true)
                            {

                                var tSymbol = findToken.tokenDetails.symbol;
                                var tName = findToken.tokenDetails.name;
                                var tDocumentUri = findToken.tokenDetails.documentUri;
                                var tDecimals = findToken.tokenDetails.decimals;
                        
                                var TransactionOutput = {
                                    schema_version: schemaVersion,
                                    address: transactionData.sender,
                                    amount: "0"
                                }

                                var TransactionDetails = {
                                    schema_version: schemaVersion,
                                    transactionType: 'BURN',
                                    senderAddress: transactionData.sender,
                                    tokenIdHex: tokenId,
                                    versionType: 1,
                                    timestamp: transactionData.timestamp.human,
                                    timestamp_unix: transactionData.timestamp.unix,
                                    symbol: tSymbol,
                                    name: tName,
                                    documentUri: tDocumentUri, 
                                    decimals: tDecimals,
                                    genesisOrMintQuantity: "0",
                                    sendOutput: TransactionOutput,
                                    note: tNote,
                                    amount_xqr: transactionData.amount.toString(),
                                    fee_xqr: transactionData.fee.toString()
                                }

                                var TransactionObject = {
                                    schema_version: schemaVersion,
                                    txid: transactionData.id,
                                    blockId: blockData.id,
                                    blockHeight: blockData.height,
                                    valid: false,
                                    invalidReason: 'Token Burn Failed - Token is Paused',
                                    transactionDetails: TransactionDetails
                                }

                                await qdb.insertDocuments('transactions', TransactionObject);

                                console.log('Burn failed:  Token is paused');
                            
                                resolve(false);
                            
                            }
                            else
                            {
                    
                                var tSymbol = findToken.tokenDetails.symbol;
                                var tName = findToken.tokenDetails.name;
                                var tDocumentUri = findToken.tokenDetails.documentUri;
                                var tDecimals = findToken.tokenDetails.decimals;

                                if (findSenderAddress == null)
                                {
                            
                                    var TransactionOutput = {
                                        schema_version: schemaVersion,
                                        address: transactionData.sender,
                                        amount: "0"
                                    }

                                    var TransactionDetails = {
                                        schema_version: schemaVersion,
                                        transactionType: 'BURN',
                                        senderAddress: transactionData.sender,
                                        tokenIdHex: tokenId,
                                        versionType: 1,
                                        timestamp: transactionData.timestamp.human,
                                        timestamp_unix: transactionData.timestamp.unix,
                                        symbol: tSymbol,
                                        name: tName,
                                        documentUri: tDocumentUri, 
                                        decimals: tDecimals,
                                        genesisOrMintQuantity: "0",
                                        sendOutput: TransactionOutput,
                                        note: tNote,
                                        amount_xqr: transactionData.amount.toString(),
                                        fee_xqr: transactionData.fee.toString()
                                    }

                                    var TransactionObject = {
                                        schema_version: schemaVersion,
                                        txid: transactionData.id,
                                        blockId: blockData.id,
                                        blockHeight: blockData.height,
                                        valid: false,
                                        invalidReason: 'Token Burn Failed - Address Not Found',
                                        transactionDetails: TransactionDetails
                                    }

                                    await qdb.insertDocuments('transactions', TransactionObject);
                            
                                    console.log('Error: Sender addresses not found');
                            
                                    resolve(false);
                            
                                }
                                else if (new Big(findSenderAddress.tokenBalance).lt(absBurnAmount))
                                {
                            
                                    var TransactionOutput = {
                                        schema_version: schemaVersion,
                                        address: transactionData.sender,
                                        amount: "0"
                                    }

                                    var TransactionDetails = {
                                        schema_version: schemaVersion,
                                        transactionType: 'BURN',
                                        senderAddress: transactionData.sender,
                                        tokenIdHex: tokenId,
                                        versionType: 1,
                                        timestamp: transactionData.timestamp.human,
                                        timestamp_unix: transactionData.timestamp.unix,
                                        symbol: tSymbol,
                                        name: tName,
                                        documentUri: tDocumentUri, 
                                        decimals: tDecimals,
                                        genesisOrMintQuantity: "0",
                                        sendOutput: TransactionOutput,
                                        note: tNote,
                                        amount_xqr: transactionData.amount.toString(),
                                        fee_xqr: transactionData.fee.toString()
                                    }

                                    var TransactionObject = {
                                        schema_version: schemaVersion,
                                        txid: transactionData.id,
                                        blockId: blockData.id,
                                        blockHeight: blockData.height,
                                        valid: false,
                                        invalidReason: 'Token Burn Failed - Insufficient Funds',
                                        transactionDetails: TransactionDetails
                                    }

                                    await qdb.insertDocuments('transactions', TransactionObject);
                                                        
                                    console.log('Error: Sender does not have enough funds');
                            
                                    resolve(false);
                            
                                }
                                else
                                {

                                    var TransactionDetails = {
                                        schema_version: schemaVersion,
                                        transactionType: 'BURN',
                                        senderAddress: transactionData.sender,
                                        tokenIdHex: tokenId,
                                        versionType: 1,
                                        timestamp: transactionData.timestamp.human,
                                        timestamp_unix: transactionData.timestamp.unix,
                                        symbol: tSymbol,
                                        name: tName,
                                        documentUri: tDocumentUri, 
                                        decimals: tDecimals,
                                        genesisOrMintQuantity: burnAmount.toString(),
                                        sendOutput: TransactionOutput,
                                        note: tNote,
                                        amount_xqr: transactionData.amount.toString(),
                                        fee_xqr: transactionData.fee.toString()
                                    }

                                    try 
                                    {
                    
                                        implement(QaeTransactionDetails)(TransactionDetails);

                                    } catch (e) {
                    
                                        console.log(e);
                                        failed = true;
                    
                                    }


                                    var TransactionObject = {
                                        schema_version: schemaVersion,
                                        txid: transactionData.id,
                                        blockId: blockData.id,
                                        blockHeight: blockData.height,
                                        valid: true,
                                        invalidReason: '',
                                        transactionDetails: TransactionDetails
                                    }
                    
                                    try 
                                    {
                    
                                        implement(QaeTransactionObject)(TransactionObject);

                                    } catch (e) {
                    
                                        console.log(e);
                                        failed = true;
                    
                                    }
                    
                                    console.log('-------------------------------------');
                                    console.log('Transaction Object');
                                    console.log(TransactionObject);
                                    console.log('-------------------------------------');
                    
                                    if (failed === false)
                                    {

                                        var rawRecordId = transactionData.sender + '.' + tokenId;
                                        var recordId = crypto.createHash('md5').update(rawRecordId).digest('hex');
                            
                                        var findAddress = await qdb.findDocument('addresses', {"recordId": recordId});
                                        if (findAddress == null)
                                        {
                            
                                            console.log('Error: Addresses not found');
                                            resolve(false);
                                            return;
                            
                                        }
                            
                                        await qdb.insertDocuments('transactions', TransactionObject);

                                        var newValidTxns = await qdb.findDocumentCount('transactions', {"transactionDetails.tokenIdHex": tokenId, "valid": true });

                                        var senderbalance = await qdb.findDocumentBigSum('transactions', {"transactionDetails.tokenIdHex": tokenId, "valid": true, "transactionDetails.sendOutput.address": findAddress.address}, 'transactionDetails.sendOutput.amount');

                                        var senderbalancesend = await qdb.findDocumentBigSum('transactions', {"transactionDetails.tokenIdHex": tokenId, "valid": true, "transactionDetails.senderAddress": findAddress.address, "transactionDetails.transactionType": "SEND"}, 'transactionDetails.sendOutput.amount');

                                        var totalsenderbalance = new Big(senderbalance).minus(senderbalancesend);

                                        await qdb.updateDocument('addresses', {"recordId": recordId }, {"tokenBalance": totalsenderbalance.toString(), "lastUpdatedBlock": blockData.height });
                            
                                        var totalBurned = new Big(findToken.tokenStats.qty_token_burned).plus(absBurnAmount);
                                        var circSupply = new Big(findToken.tokenStats.qty_token_circulating_supply).plus(burnAmount);
                            
                                        var xqrspent = await qdb.findDocumentBigSum('transactions', {"transactionDetails.tokenIdHex": tokenId}, 'transactionDetails.amount_xqr');
                            
                                        await qdb.updateDocument('tokens', {"tokenDetails.tokenIdHex": tokenId }, {"lastUpdatedBlock": blockData.height, "tokenStats.qty_valid_txns_since_genesis": newValidTxns, "tokenStats.qty_token_burned": totalBurned.toString(), "tokenStats.qty_token_circulating_supply": circSupply.toString(), "tokenStats.qty_xqr_spent": xqrspent.toString()});
                            
                                        resolve(true);
                                            
                                    }
                                    else
                                    {

                                        var TransactionOutput = {
                                            schema_version: schemaVersion,
                                            address: transactionData.sender,
                                            amount: "0"
                                        }

                                        var TransactionDetails = {
                                            schema_version: schemaVersion,
                                            transactionType: 'BURN',
                                            senderAddress: transactionData.sender,
                                            tokenIdHex: tokenId,
                                            versionType: 1,
                                            timestamp: transactionData.timestamp.human,
                                            timestamp_unix: transactionData.timestamp.unix,
                                            symbol: tSymbol,
                                            name: tName,
                                            documentUri: tDocumentUri, 
                                            decimals: tDecimals,
                                            genesisOrMintQuantity: "0",
                                            sendOutput: TransactionOutput,
                                            note: tNote,
                                            amount_xqr: transactionData.amount.toString(),
                                            fee_xqr: transactionData.fee.toString()
                                        }

                                        var TransactionObject = {
                                            schema_version: schemaVersion,
                                            txid: transactionData.id,
                                            blockId: blockData.id,
                                            blockHeight: blockData.height,
                                            valid: false,
                                            invalidReason: 'Token Burn Failed - General Error',
                                            transactionDetails: TransactionDetails
                                        }

                                        await qdb.insertDocuments('transactions', TransactionObject);
                            
                                        resolve(false);
                        
                                    }
                            
                                }
                            
                            }
                    
                        })();
                
                
                    }
                    else if (contractData.tp == 'PAUSE' && transactionData.recipient == QaeMasterAddress)
                    {
                    
                        // Pause Contract
                    
                        (async () => {

                            var failed = false;

                            var tokenId = contractData.id;
                            
                            var tNote = '';
                            if (contractData.no) tNote = contractData.no
                    
                            var TransactionOutput = {
                                schema_version: schemaVersion,
                                address: transactionData.sender,
                                amount: "0"
                            }

                            try 
                            {
                    
                                implement(QaeTransactionOutput)(TransactionOutput);

                            } catch (e) {
                    
                                console.log(e);
                                failed = true;
                    
                            }

                            var findToken = await qdb.findDocument('tokens', {"tokenDetails.tokenIdHex": tokenId});
    
                            var srawRecordId = transactionData.sender + '.' + tokenId;
                            var srecordId = crypto.createHash('md5').update(srawRecordId).digest('hex');
                            
                            var findSenderAddress = await qdb.findDocument('addresses', {"recordId": srecordId});
                            
                            // Check if it actually exists
                            
                            if (findToken == null)
                            {

                                var tSymbol = null;
                                var tName = null;
                                var tDocumentUri = null;
                                var tDecimals = 0;
                        
                                var TransactionOutput = {
                                    schema_version: schemaVersion,
                                    address: transactionData.sender,
                                    amount: "0"
                                }

                                var TransactionDetails = {
                                    schema_version: schemaVersion,
                                    transactionType: 'PAUSE',
                                    senderAddress: transactionData.sender,
                                    tokenIdHex: tokenId,
                                    versionType: 1,
                                    timestamp: transactionData.timestamp.human,
                                    timestamp_unix: transactionData.timestamp.unix,
                                    symbol: tSymbol,
                                    name: tName,
                                    documentUri: tDocumentUri, 
                                    decimals: tDecimals,
                                    genesisOrMintQuantity: "0",
                                    sendOutput: TransactionOutput,
                                    note: tNote,
                                    amount_xqr: transactionData.amount.toString(),
                                    fee_xqr: transactionData.fee.toString()
                                }

                                var TransactionObject = {
                                    schema_version: schemaVersion,
                                    txid: transactionData.id,
                                    blockId: blockData.id,
                                    blockHeight: blockData.height,
                                    valid: false,
                                    invalidReason: 'Token Pause Failed - Token Does Not Exist',
                                    transactionDetails: TransactionDetails
                                }

                                await qdb.insertDocuments('transactions', TransactionObject);
                            
                                console.log('Token does not exist');
                            
                                resolve(false);
                            
                            }
                            else if (findToken.tokenDetails.ownerAddress != transactionData.sender)
                            {

                                var tSymbol = findToken.tokenDetails.symbol;
                                var tName = findToken.tokenDetails.name;
                                var tDocumentUri = findToken.tokenDetails.documentUri;
                                var tDecimals = findToken.tokenDetails.decimals;
                        
                                var TransactionOutput = {
                                    schema_version: schemaVersion,
                                    address: transactionData.sender,
                                    amount: "0"
                                }

                                var TransactionDetails = {
                                    schema_version: schemaVersion,
                                    transactionType: 'PAUSE',
                                    senderAddress: transactionData.sender,
                                    tokenIdHex: tokenId,
                                    versionType: 1,
                                    timestamp: transactionData.timestamp.human,
                                    timestamp_unix: transactionData.timestamp.unix,
                                    symbol: tSymbol,
                                    name: tName,
                                    documentUri: tDocumentUri, 
                                    decimals: tDecimals,
                                    genesisOrMintQuantity: "0",
                                    sendOutput: TransactionOutput,
                                    note: tNote,
                                    amount_xqr: transactionData.amount.toString(),
                                    fee_xqr: transactionData.fee.toString()
                                }

                                var TransactionObject = {
                                    schema_version: schemaVersion,
                                    txid: transactionData.id,
                                    blockId: blockData.id,
                                    blockHeight: blockData.height,
                                    valid: false,
                                    invalidReason: 'Token Pause Failed - Not Owner',
                                    transactionDetails: TransactionDetails
                                }

                                await qdb.insertDocuments('transactions', TransactionObject);
                            
                                console.log('Pause failed:  Not the token owner');
                            
                                resolve(false);
                            
                            }
                            else if (findToken.tokenDetails.pausable != true)
                            {

                                var tSymbol = findToken.tokenDetails.symbol;
                                var tName = findToken.tokenDetails.name;
                                var tDocumentUri = findToken.tokenDetails.documentUri;
                                var tDecimals = findToken.tokenDetails.decimals;
                        
                                var TransactionOutput = {
                                    schema_version: schemaVersion,
                                    address: transactionData.sender,
                                    amount: "0"
                                }

                                var TransactionDetails = {
                                    schema_version: schemaVersion,
                                    transactionType: 'PAUSE',
                                    senderAddress: transactionData.sender,
                                    tokenIdHex: tokenId,
                                    versionType: 1,
                                    timestamp: transactionData.timestamp.human,
                                    timestamp_unix: transactionData.timestamp.unix,
                                    symbol: tSymbol,
                                    name: tName,
                                    documentUri: tDocumentUri, 
                                    decimals: tDecimals,
                                    genesisOrMintQuantity: "0",
                                    sendOutput: TransactionOutput,
                                    note: tNote,
                                    amount_xqr: transactionData.amount.toString(),
                                    fee_xqr: transactionData.fee.toString()
                                }

                                var TransactionObject = {
                                    schema_version: schemaVersion,
                                    txid: transactionData.id,
                                    blockId: blockData.id,
                                    blockHeight: blockData.height,
                                    valid: false,
                                    invalidReason: 'Token Pause Failed - Not Pausable',
                                    transactionDetails: TransactionDetails
                                }
 
                                await qdb.insertDocuments('transactions', TransactionObject);
                            
                                console.log('Pause failed:  Not pausable');
                            
                                resolve(false);
                            
                            }
                            else
                            {
                    
                                var tSymbol = findToken.tokenDetails.symbol;
                                var tName = findToken.tokenDetails.name;
                                var tDocumentUri = findToken.tokenDetails.documentUri;
                                var tDecimals = findToken.tokenDetails.decimals;

                                if (findSenderAddress == null)
                                {
                            
                                    var TransactionOutput = {
                                        schema_version: schemaVersion,
                                        address: transactionData.sender,
                                        amount: "0"
                                    }

                                    var TransactionDetails = {
                                        schema_version: schemaVersion,
                                        transactionType: 'PAUSE',
                                        senderAddress: transactionData.sender,
                                        tokenIdHex: tokenId,
                                        versionType: 1,
                                        timestamp: transactionData.timestamp.human,
                                        timestamp_unix: transactionData.timestamp.unix,
                                        symbol: tSymbol,
                                        name: tName,
                                        documentUri: tDocumentUri, 
                                        decimals: tDecimals,
                                        genesisOrMintQuantity: "0",
                                        sendOutput: TransactionOutput,
                                        note: tNote,
                                        amount_xqr: transactionData.amount.toString(),
                                        fee_xqr: transactionData.fee.toString()
                                    }

                                    var TransactionObject = {
                                        schema_version: schemaVersion,
                                        txid: transactionData.id,
                                        blockId: blockData.id,
                                        blockHeight: blockData.height,
                                        valid: false,
                                        invalidReason: 'Token Pause Failed - Address Not Found',
                                        transactionDetails: TransactionDetails
                                    }

                                    await qdb.insertDocuments('transactions', TransactionObject);
                                                        
                                    console.log('Error: Sender addresses not found');
                            
                                    resolve(false);
                            
                                }
                                else if (findToken.paused == true)
                                {
                            
                                    var TransactionOutput = {
                                        schema_version: schemaVersion,
                                        address: transactionData.sender,
                                        amount: "0"
                                    }

                                    var TransactionDetails = {
                                        schema_version: schemaVersion,
                                        transactionType: 'PAUSE',
                                        senderAddress: transactionData.sender,
                                        tokenIdHex: tokenId,
                                        versionType: 1,
                                        timestamp: transactionData.timestamp.human,
                                        timestamp_unix: transactionData.timestamp.unix,
                                        symbol: tSymbol,
                                        name: tName,
                                        documentUri: tDocumentUri, 
                                        decimals: tDecimals,
                                        genesisOrMintQuantity: "0",
                                        sendOutput: TransactionOutput,
                                        note: tNote,
                                        amount_xqr: transactionData.amount.toString(),
                                        fee_xqr: transactionData.fee.toString()
                                    }

                                    var TransactionObject = {
                                        schema_version: schemaVersion,
                                        txid: transactionData.id,
                                        blockId: blockData.id,
                                        blockHeight: blockData.height,
                                        valid: false,
                                        invalidReason: 'Token Pause Failed - Already Paused',
                                        transactionDetails: TransactionDetails
                                    }

                                    await qdb.insertDocuments('transactions', TransactionObject);
                                                        
                                    console.log('Error: Contract is already paused');
                            
                                    resolve(false);
                            
                                }
                                else
                                {

                                    var TransactionDetails = {
                                        schema_version: schemaVersion,
                                        transactionType: 'PAUSE',
                                        senderAddress: transactionData.sender,
                                        tokenIdHex: tokenId,
                                        versionType: 1,
                                        timestamp: transactionData.timestamp.human,
                                        timestamp_unix: transactionData.timestamp.unix,
                                        symbol: tSymbol,
                                        name: tName,
                                        documentUri: tDocumentUri, 
                                        decimals: tDecimals,
                                        genesisOrMintQuantity: "0",
                                        sendOutput: TransactionOutput,
                                        note: tNote,
                                        amount_xqr: transactionData.amount.toString(),
                                        fee_xqr: transactionData.fee.toString()
                                    }

                                    try 
                                    {
                    
                                        implement(QaeTransactionDetails)(TransactionDetails);

                                    } catch (e) {
                    
                                        console.log(e);
                                        failed = true;
                    
                                    }


                                    var TransactionObject = {
                                        schema_version: schemaVersion,
                                        txid: transactionData.id,
                                        blockId: blockData.id,
                                        blockHeight: blockData.height,
                                        valid: true,
                                        invalidReason: '',
                                        transactionDetails: TransactionDetails
                                    }
                    
                                    try 
                                    {
                    
                                        implement(QaeTransactionObject)(TransactionObject);

                                    } catch (e) {
                    
                                        console.log(e);
                                        failed = true;
                    
                                    }
                    
                                    console.log('-------------------------------------');
                                    console.log('Transaction Object');
                                    console.log(TransactionObject);
                                    console.log('-------------------------------------');
                    
                                    if (failed === false)
                                    {

                                        var rawRecordId = transactionData.sender + '.' + tokenId;
                                        var recordId = crypto.createHash('md5').update(rawRecordId).digest('hex');
                            
                                        var findAddress = await qdb.findDocument('addresses', {"recordId": recordId});
                                        if (findAddress == null)
                                        {
                            
                                            console.log('Error: Addresses not found');
                                            resolve(false);
                                            return;
                            
                                        }
                            
                                        await qdb.insertDocuments('transactions', TransactionObject);

                                        var newValidTxns = await qdb.findDocumentCount('transactions', {"transactionDetails.tokenIdHex": tokenId, "valid": true });
                            
                                        var xqrspent = await qdb.findDocumentBigSum('transactions', {"transactionDetails.tokenIdHex": tokenId}, 'transactionDetails.amount_xqr');
                            
                                        await qdb.updateDocument('tokens', {"tokenDetails.tokenIdHex": tokenId }, {"paused": true, "lastUpdatedBlock": blockData.height, "tokenStats.qty_valid_txns_since_genesis": newValidTxns, "tokenStats.qty_xqr_spent": xqrspent.toString()});
                            
                                        resolve(true);
                                            
                                    }
                                    else
                                    {

                                        var TransactionOutput = {
                                            schema_version: schemaVersion,
                                            address: transactionData.sender,
                                            amount: "0"
                                        }

                                        var TransactionDetails = {
                                            schema_version: schemaVersion,
                                            transactionType: 'PAUSE',
                                            senderAddress: transactionData.sender,
                                            tokenIdHex: tokenId,
                                            versionType: 1,
                                            timestamp: transactionData.timestamp.human,
                                            timestamp_unix: transactionData.timestamp.unix,
                                            symbol: tSymbol,
                                            name: tName,
                                            documentUri: tDocumentUri, 
                                            decimals: tDecimals,
                                            genesisOrMintQuantity: "0",
                                            sendOutput: TransactionOutput,
                                            note: tNote,
                                            amount_xqr: transactionData.amount.toString(),
                                            fee_xqr: transactionData.fee.toString()
                                        }

                                        var TransactionObject = {
                                            schema_version: schemaVersion,
                                            txid: transactionData.id,
                                            blockId: blockData.id,
                                            blockHeight: blockData.height,
                                            valid: false,
                                            invalidReason: 'Token Pause Failed - General Error',
                                            transactionDetails: TransactionDetails
                                        }

                                        await qdb.insertDocuments('transactions', TransactionObject);
                            
                                        resolve(false);
                        
                                    }
                            
                                }
                            
                            }
                    
                        })();
                    
                    }
                    else if (contractData.tp == 'RESUME' && transactionData.recipient == QaeMasterAddress)
                    {
                    
                        // Resume Contract
                    
                        (async () => {

                            var failed = false;

                            var tokenId = contractData.id;

                            var tNote = '';
                            if (contractData.no) tNote = contractData.no
                            
                            var TransactionOutput = {
                                schema_version: schemaVersion,
                                address: transactionData.sender,
                                amount: "0"
                            }

                            try 
                            {
                    
                                implement(QaeTransactionOutput)(TransactionOutput);

                            } catch (e) {
                    
                                console.log(e);
                                failed = true;
                    
                            }
                    
                            var findToken = await qdb.findDocument('tokens', {"tokenDetails.tokenIdHex": tokenId});
    
                            var srawRecordId = transactionData.sender + '.' + tokenId;
                            var srecordId = crypto.createHash('md5').update(srawRecordId).digest('hex');
                            
                            var findSenderAddress = await qdb.findDocument('addresses', {"recordId": srecordId});
                            
                            // Check if it actually exists
                            
                            if (findToken == null)
                            {

                                var tSymbol = null;
                                var tName = null;
                                var tDocumentUri = null;
                                var tDecimals = 0;
                        
                                var TransactionOutput = {
                                    schema_version: schemaVersion,
                                    address: transactionData.sender,
                                    amount: "0"
                                }

                                var TransactionDetails = {
                                    schema_version: schemaVersion,
                                    transactionType: 'RESUME',
                                    senderAddress: transactionData.sender,
                                    tokenIdHex: tokenId,
                                    versionType: 1,
                                    timestamp: transactionData.timestamp.human,
                                    timestamp_unix: transactionData.timestamp.unix,
                                    symbol: tSymbol,
                                    name: tName,
                                    documentUri: tDocumentUri, 
                                    decimals: tDecimals,
                                    genesisOrMintQuantity: "0",
                                    sendOutput: TransactionOutput,
                                    note: tNote,
                                    amount_xqr: transactionData.amount.toString(),
                                    fee_xqr: transactionData.fee.toString()
                                }

                                var TransactionObject = {
                                    schema_version: schemaVersion,
                                    txid: transactionData.id,
                                    blockId: blockData.id,
                                    blockHeight: blockData.height,
                                    valid: false,
                                    invalidReason: 'Token Resume Failed - Token Does Not Exist',
                                    transactionDetails: TransactionDetails
                                }

                                await qdb.insertDocuments('transactions', TransactionObject);
                            
                                console.log('Token does not exist');
                            
                                resolve(false);
                            
                            }
                            else if (findToken.tokenDetails.ownerAddress != transactionData.sender)
                            {

                                var tSymbol = findToken.tokenDetails.symbol;
                                var tName = findToken.tokenDetails.name;
                                var tDocumentUri = findToken.tokenDetails.documentUri;
                                var tDecimals = findToken.tokenDetails.decimals;
                        
                                var TransactionOutput = {
                                    schema_version: schemaVersion,
                                    address: transactionData.sender,
                                    amount: "0"
                                }

                                var TransactionDetails = {
                                    schema_version: schemaVersion,
                                    transactionType: 'RESUME',
                                    senderAddress: transactionData.sender,
                                    tokenIdHex: tokenId,
                                    versionType: 1,
                                    timestamp: transactionData.timestamp.human,
                                    timestamp_unix: transactionData.timestamp.unix,
                                    symbol: tSymbol,
                                    name: tName,
                                    documentUri: tDocumentUri, 
                                    decimals: tDecimals,
                                    genesisOrMintQuantity: "0",
                                    sendOutput: TransactionOutput,
                                    note: tNote,
                                    amount_xqr: transactionData.amount.toString(),
                                    fee_xqr: transactionData.fee.toString()
                                }

                                var TransactionObject = {
                                    schema_version: schemaVersion,
                                    txid: transactionData.id,
                                    blockId: blockData.id,
                                    blockHeight: blockData.height,
                                    valid: false,
                                    invalidReason: 'Token Resume Failed - Not Owner',
                                    transactionDetails: TransactionDetails
                                }

                                await qdb.insertDocuments('transactions', TransactionObject);
                            
                                console.log('Resume failed:  Not the token owner');
                            
                                resolve(false);
                            
                            }
                            else
                            {
                    
                                var tSymbol = findToken.tokenDetails.symbol;
                                var tName = findToken.tokenDetails.name;
                                var tDocumentUri = findToken.tokenDetails.documentUri;
                                var tDecimals = findToken.tokenDetails.decimals;

                                if (findSenderAddress == null)
                                {
                            
                                    var TransactionOutput = {
                                        schema_version: schemaVersion,
                                        address: transactionData.sender,
                                        amount: "0"
                                    }

                                    var TransactionDetails = {
                                        schema_version: schemaVersion,
                                        transactionType: 'RESUME',
                                        senderAddress: transactionData.sender,
                                        tokenIdHex: tokenId,
                                        versionType: 1,
                                        timestamp: transactionData.timestamp.human,
                                        timestamp_unix: transactionData.timestamp.unix,
                                        symbol: tSymbol,
                                        name: tName,
                                        documentUri: tDocumentUri, 
                                        decimals: tDecimals,
                                        genesisOrMintQuantity: "0",
                                        sendOutput: TransactionOutput,
                                        note: tNote,
                                        amount_xqr: transactionData.amount.toString(),
                                        fee_xqr: transactionData.fee.toString()
                                    }

                                    var TransactionObject = {
                                        schema_version: schemaVersion,
                                        txid: transactionData.id,
                                        blockId: blockData.id,
                                        blockHeight: blockData.height,
                                        valid: false,
                                        invalidReason: 'Token Resume Failed - Address Not Found',
                                        transactionDetails: TransactionDetails
                                    }

                                    await qdb.insertDocuments('transactions', TransactionObject);
                                                        
                                    console.log('Error: Sender addresses not found');
                            
                                    resolve(false);
                            
                                }
                                else if (findToken.paused == false)
                                {
                            
                                    var TransactionOutput = {
                                        schema_version: schemaVersion,
                                        address: transactionData.sender,
                                        amount: "0"
                                    }

                                    var TransactionDetails = {
                                        schema_version: schemaVersion,
                                        transactionType: 'RESUME',
                                        senderAddress: transactionData.sender,
                                        tokenIdHex: tokenId,
                                        versionType: 1,
                                        timestamp: transactionData.timestamp.human,
                                        timestamp_unix: transactionData.timestamp.unix,
                                        symbol: tSymbol,
                                        name: tName,
                                        documentUri: tDocumentUri, 
                                        decimals: tDecimals,
                                        genesisOrMintQuantity: "0",
                                        sendOutput: TransactionOutput,
                                        note: tNote,
                                        amount_xqr: transactionData.amount.toString(),
                                        fee_xqr: transactionData.fee.toString()
                                    }

                                    var TransactionObject = {
                                        schema_version: schemaVersion,
                                        txid: transactionData.id,
                                        blockId: blockData.id,
                                        blockHeight: blockData.height,
                                        valid: false,
                                        invalidReason: 'Token Resume Failed - Not Paused',
                                        transactionDetails: TransactionDetails
                                    }

                                    await qdb.insertDocuments('transactions', TransactionObject);
                                                        
                                    console.log('Error: Contract is not paused');
                            
                                    resolve(false);
                            
                                }
                                else
                                {

                                    var TransactionDetails = {
                                        schema_version: schemaVersion,
                                        transactionType: 'RESUME',
                                        senderAddress: transactionData.sender,
                                        tokenIdHex: tokenId,
                                        versionType: 1,
                                        timestamp: transactionData.timestamp.human,
                                        timestamp_unix: transactionData.timestamp.unix,
                                        symbol: tSymbol,
                                        name: tName,
                                        documentUri: tDocumentUri, 
                                        decimals: tDecimals,
                                        genesisOrMintQuantity: "0",
                                        sendOutput: TransactionOutput,
                                        note: tNote,
                                        amount_xqr: transactionData.amount.toString(),
                                        fee_xqr: transactionData.fee.toString()
                                    }

                                    try 
                                    {
                    
                                        implement(QaeTransactionDetails)(TransactionDetails);

                                    } catch (e) {
                    
                                        console.log(e);
                                        failed = true;
                    
                                    }


                                    var TransactionObject = {
                                        schema_version: schemaVersion,
                                        txid: transactionData.id,
                                        blockId: blockData.id,
                                        blockHeight: blockData.height,
                                        valid: true,
                                        invalidReason: '',
                                        transactionDetails: TransactionDetails
                                    }
                    
                                    try 
                                    {
                    
                                        implement(QaeTransactionObject)(TransactionObject);

                                    } catch (e) {
                    
                                        console.log(e);
                                        failed = true;
                    
                                    }
                    
                                    console.log('-------------------------------------');
                                    console.log('Transaction Object');
                                    console.log(TransactionObject);
                                    console.log('-------------------------------------');
                    
                                    if (failed === false)
                                    {

                                        var rawRecordId = transactionData.sender + '.' + tokenId;
                                        var recordId = crypto.createHash('md5').update(rawRecordId).digest('hex');
                            
                                        var findAddress = await qdb.findDocument('addresses', {"recordId": recordId});
                                        if (findAddress == null)
                                        {
                            
                                            console.log('Error: Addresses not found');
                                            resolve(false);
                                            return;
                            
                                        }
                            
                                        await qdb.insertDocuments('transactions', TransactionObject);

                                        var newValidTxns = await qdb.findDocumentCount('transactions', {"transactionDetails.tokenIdHex": tokenId, "valid": true });
                            
                                        var xqrspent = await qdb.findDocumentBigSum('transactions', {"transactionDetails.tokenIdHex": tokenId}, 'transactionDetails.amount_xqr');
                            
                                        await qdb.updateDocument('tokens', {"tokenDetails.tokenIdHex": tokenId }, {"paused": false, "lastUpdatedBlock": blockData.height, "tokenStats.qty_valid_txns_since_genesis": newValidTxns, "tokenStats.qty_xqr_spent": xqrspent.toString()});
                            
                                        resolve(true);
                                            
                                    }
                                    else
                                    {

                                        var TransactionOutput = {
                                            schema_version: schemaVersion,
                                            address: transactionData.sender,
                                            amount: "0"
                                        }

                                        var TransactionDetails = {
                                            schema_version: schemaVersion,
                                            transactionType: 'RESUME',
                                            senderAddress: transactionData.sender,
                                            tokenIdHex: tokenId,
                                            versionType: 1,
                                            timestamp: transactionData.timestamp.human,
                                            timestamp_unix: transactionData.timestamp.unix,
                                            symbol: tSymbol,
                                            name: tName,
                                            documentUri: tDocumentUri, 
                                            decimals: tDecimals,
                                            genesisOrMintQuantity: "0",
                                            sendOutput: TransactionOutput,
                                            note: tNote,
                                            amount_xqr: transactionData.amount.toString(),
                                            fee_xqr: transactionData.fee.toString()
                                        }

                                        var TransactionObject = {
                                            schema_version: schemaVersion,
                                            txid: transactionData.id,
                                            blockId: blockData.id,
                                            blockHeight: blockData.height,
                                            valid: false,
                                            invalidReason: 'Token Resume Failed - General Error',
                                            transactionDetails: TransactionDetails
                                        }

                                        await qdb.insertDocuments('transactions', TransactionObject);
                            
                                        resolve(false);
                        
                                    }
                            
                                }
                            
                            }
                    
                        })();
                    
                    }
                    else if (contractData.tp == 'NEWOWNER' && transactionData.recipient == QaeMasterAddress)
                    {
                    
                    
                        // Assign new ownership of token
                    
                        (async () => {

                            var failed = false;

                            var tokenId = contractData.id;
                            
                            var tNote = '';
                            if (contractData.no) tNote = contractData.no
                    
                            var TransactionOutput = {
                                schema_version: schemaVersion,
                                address: transactionData.sender,
                                amount: "0"
                            }

                            try 
                            {
                    
                                implement(QaeTransactionOutput)(TransactionOutput);

                            } catch (e) {
                    
                                console.log(e);
                                failed = true;
                    
                            }

                            var findToken = await qdb.findDocument('tokens', {"tokenDetails.tokenIdHex": tokenId});
    
                            var srawRecordId = transactionData.sender + '.' + tokenId;
                            var srecordId = crypto.createHash('md5').update(srawRecordId).digest('hex');
                            
                            var findSenderAddress = await qdb.findDocument('addresses', {"recordId": srecordId});
                            
                            // Check if it actually exists
                            
                            if (findToken == null)
                            {

                                var tSymbol = null;
                                var tName = null;
                                var tDocumentUri = null;
                                var tDecimals = 0;
                        
                                var TransactionOutput = {
                                    schema_version: schemaVersion,
                                    address: transactionData.sender,
                                    amount: "0"
                                }

                                var TransactionDetails = {
                                    schema_version: schemaVersion,
                                    transactionType: 'NEWOWNER',
                                    senderAddress: transactionData.sender,
                                    tokenIdHex: tokenId,
                                    versionType: 1,
                                    timestamp: transactionData.timestamp.human,
                                    timestamp_unix: transactionData.timestamp.unix,
                                    symbol: tSymbol,
                                    name: tName,
                                    documentUri: tDocumentUri, 
                                    decimals: tDecimals,
                                    genesisOrMintQuantity: "0",
                                    sendOutput: TransactionOutput,
                                    note: tNote,
                                    amount_xqr: transactionData.amount.toString(),
                                    fee_xqr: transactionData.fee.toString()
                                }

                                var TransactionObject = {
                                    schema_version: schemaVersion,
                                    txid: transactionData.id,
                                    blockId: blockData.id,
                                    blockHeight: blockData.height,
                                    valid: false,
                                    invalidReason: 'Token NewOwner Failed - Token Does Not Exist',
                                    transactionDetails: TransactionDetails
                                }

                                await qdb.insertDocuments('transactions', TransactionObject);
                            
                                console.log('Token does not exist');
                            
                                resolve(false);
                            
                            }
                            else if (findToken.tokenDetails.ownerAddress != transactionData.sender)
                            {

                                var tSymbol = findToken.tokenDetails.symbol;
                                var tName = findToken.tokenDetails.name;
                                var tDocumentUri = findToken.tokenDetails.documentUri;
                                var tDecimals = findToken.tokenDetails.decimals;
                        
                                var TransactionOutput = {
                                    schema_version: schemaVersion,
                                    address: transactionData.sender,
                                    amount: "0"
                                }

                                var TransactionDetails = {
                                    schema_version: schemaVersion,
                                    transactionType: 'NEWOWNER',
                                    senderAddress: transactionData.sender,
                                    tokenIdHex: tokenId,
                                    versionType: 1,
                                    timestamp: transactionData.timestamp.human,
                                    timestamp_unix: transactionData.timestamp.unix,
                                    symbol: tSymbol,
                                    name: tName,
                                    documentUri: tDocumentUri, 
                                    decimals: tDecimals,
                                    genesisOrMintQuantity: "0",
                                    sendOutput: TransactionOutput,
                                    note: tNote,
                                    amount_xqr: transactionData.amount.toString(),
                                    fee_xqr: transactionData.fee.toString()
                                }

                                var TransactionObject = {
                                    schema_version: schemaVersion,
                                    txid: transactionData.id,
                                    blockId: blockData.id,
                                    blockHeight: blockData.height,
                                    valid: false,
                                    invalidReason: 'Token NewOwner Failed - Not Owner',
                                    transactionDetails: TransactionDetails
                                }

                                await qdb.insertDocuments('transactions', TransactionObject);
                            
                                console.log('New Ownership failed:  Not the token owner');
                            
                                resolve(false);
                            
                            }
                            else if (findToken.paused == true)
                            {

                                var tSymbol = findToken.tokenDetails.symbol;
                                var tName = findToken.tokenDetails.name;
                                var tDocumentUri = findToken.tokenDetails.documentUri;
                                var tDecimals = findToken.tokenDetails.decimals;
                        
                                var TransactionOutput = {
                                    schema_version: schemaVersion,
                                    address: transactionData.sender,
                                    amount: "0"
                                }

                                var TransactionDetails = {
                                    schema_version: schemaVersion,
                                    transactionType: 'NEWOWNER',
                                    senderAddress: transactionData.sender,
                                    tokenIdHex: tokenId,
                                    versionType: 1,
                                    timestamp: transactionData.timestamp.human,
                                    timestamp_unix: transactionData.timestamp.unix,
                                    symbol: tSymbol,
                                    name: tName,
                                    documentUri: tDocumentUri, 
                                    decimals: tDecimals,
                                    genesisOrMintQuantity: "0",
                                    sendOutput: TransactionOutput,
                                    note: tNote,
                                    amount_xqr: transactionData.amount.toString(),
                                    fee_xqr: transactionData.fee.toString()
                                }

                                var TransactionObject = {
                                    schema_version: schemaVersion,
                                    txid: transactionData.id,
                                    blockId: blockData.id,
                                    blockHeight: blockData.height,
                                    valid: false,
                                    invalidReason: 'Token NewOwner Failed - Token is Paused',
                                    transactionDetails: TransactionDetails
                                }

                                await qdb.insertDocuments('transactions', TransactionObject);
                            
                                console.log('New ownership failed:  Token is paused');
                            
                                resolve(false);
                            
                            }
                            else
                            {
                    
                                var tSymbol = findToken.tokenDetails.symbol;
                                var tName = findToken.tokenDetails.name;
                                var tDocumentUri = findToken.tokenDetails.documentUri;
                                var tDecimals = findToken.tokenDetails.decimals;

                                if (findSenderAddress == null)
                                {
                            
                                    var TransactionOutput = {
                                        schema_version: schemaVersion,
                                        address: transactionData.sender,
                                        amount: "0"
                                    }

                                    var TransactionDetails = {
                                        schema_version: schemaVersion,
                                        transactionType: 'NEWOWNER',
                                        senderAddress: transactionData.sender,
                                        tokenIdHex: tokenId,
                                        versionType: 1,
                                        timestamp: transactionData.timestamp.human,
                                        timestamp_unix: transactionData.timestamp.unix,
                                        symbol: tSymbol,
                                        name: tName,
                                        documentUri: tDocumentUri, 
                                        decimals: tDecimals,
                                        genesisOrMintQuantity: "0",
                                        sendOutput: TransactionOutput,
                                        note: tNote,
                                        amount_xqr: transactionData.amount.toString(),
                                        fee_xqr: transactionData.fee.toString()
                                    }

                                    var TransactionObject = {
                                        schema_version: schemaVersion,
                                        txid: transactionData.id,
                                        blockId: blockData.id,
                                        blockHeight: blockData.height,
                                        valid: false,
                                        invalidReason: 'Token NewOwner Failed - Address Not Found',
                                        transactionDetails: TransactionDetails
                                    }

                                    await qdb.insertDocuments('transactions', TransactionObject);
                                                        
                                    console.log('Error: Sender addresses not found');
                            
                                    resolve(false);
                            
                                }
                                else
                                {

                                    var TransactionDetails = {
                                        schema_version: schemaVersion,
                                        transactionType: 'NEWOWNER',
                                        senderAddress: transactionData.sender,
                                        tokenIdHex: tokenId,
                                        versionType: 1,
                                        timestamp: transactionData.timestamp.human,
                                        timestamp_unix: transactionData.timestamp.unix,
                                        symbol: tSymbol,
                                        name: tName,
                                        documentUri: tDocumentUri, 
                                        decimals: tDecimals,
                                        genesisOrMintQuantity: "0",
                                        sendOutput: TransactionOutput,
                                        note: tNote,
                                        amount_xqr: transactionData.amount.toString(),
                                        fee_xqr: transactionData.fee.toString()
                                    }

                                    try 
                                    {
                    
                                        implement(QaeTransactionDetails)(TransactionDetails);

                                    } catch (e) {
                    
                                        console.log(e);
                                        failed = true;
                    
                                    }


                                    var TransactionObject = {
                                        schema_version: schemaVersion,
                                        txid: transactionData.id,
                                        blockId: blockData.id,
                                        blockHeight: blockData.height,
                                        valid: true,
                                        invalidReason: '',
                                        transactionDetails: TransactionDetails
                                    }
                    
                                    try 
                                    {
                    
                                        implement(QaeTransactionObject)(TransactionObject);

                                    } catch (e) {
                    
                                        console.log(e);
                                        failed = true;
                    
                                    }
                    
                                    console.log('-------------------------------------');
                                    console.log('Transaction Object');
                                    console.log(TransactionObject);
                                    console.log('-------------------------------------');
                    
                                    if (failed === false)
                                    {

                                        var rawRecordId = transactionData.sender + '.' + tokenId;
                                        var recordId = crypto.createHash('md5').update(rawRecordId).digest('hex');
                            
                                        var findAddress = await qdb.findDocument('addresses', {"recordId": recordId});
                                        if (findAddress == null)
                                        {
                            
                                            console.log('Error: Addresses not found');
                                            resolve(false);
                                            return;
                            
                                        }
                            
                                        await qdb.insertDocuments('transactions', TransactionObject);

                                        var newValidTxns = await qdb.findDocumentCount('transactions', {"transactionDetails.tokenIdHex": tokenId, "valid": true });

                                        await qdb.updateDocument('addresses', {"recordId": recordId }, {"isOwner": false, "lastUpdatedBlock": blockData.height });
                                        
                                        // Recipient
                            
                                        var rrawRecordId = transactionData.recipient + '.' + tokenId;
                                        var rrecordId = crypto.createHash('md5').update(rrawRecordId).digest('hex');
                            
                                        var findRecipientAddress = await qdb.findDocument('addresses', {"recordId": rrecordId});
                                        if (findRecipientAddress == null)
                                        {
                            
                                            // Create New Record
                                                                
                                            var AddressObject = {
                                                schema_version: schemaVersion,
                                                recordId: rrecordId,
                                                address: transactionData.recipient,
                                                tokenIdHex: tokenId,
                                                isOwner: true,
                                                tokenBalance: "0",
                                                tokenDecimals: tDecimals,
                                                lastUpdatedBlock: blockData.height
                                            }

                                            try 
                                            {
                    
                                                implement(QaeAddressObject)(AddressObject);

                                            } catch (e) {
                    
                                                console.log(e);
                    
                                            }
                                
                                            await qdb.insertDocuments('addresses', AddressObject);
                                                                
                                        }
                                        else 
                                        {
                            
                                            // Update Record
                            
                                            await qdb.updateDocument('addresses', {"recordId": rrecordId }, {"isOwner": true, "lastUpdatedBlock": blockData.height });
                                
                                        }

                                        //
                            
                                        var xqrspent = await qdb.findDocumentBigSum('transactions', {"transactionDetails.tokenIdHex": tokenId}, 'transactionDetails.amount_xqr');
                            
                                        await qdb.updateDocument('tokens', {"tokenDetails.tokenIdHex": tokenId }, {"tokenDetails.ownerAddress": transactionData.recipient, "lastUpdatedBlock": blockData.height, "tokenStats.qty_valid_txns_since_genesis": newValidTxns, "tokenStats.qty_xqr_spent": xqrspent.toString()});
                            
                                        resolve(true);
                                            
                                    }
                                    else
                                    {

                                        var TransactionOutput = {
                                            schema_version: schemaVersion,
                                            address: transactionData.sender,
                                            amount: "0"
                                        }

                                        var TransactionDetails = {
                                            schema_version: schemaVersion,
                                            transactionType: 'NEWOWNER',
                                            senderAddress: transactionData.sender,
                                            tokenIdHex: tokenId,
                                            versionType: 1,
                                            timestamp: transactionData.timestamp.human,
                                            timestamp_unix: transactionData.timestamp.unix,
                                            symbol: tSymbol,
                                            name: tName,
                                            documentUri: tDocumentUri, 
                                            decimals: tDecimals,
                                            genesisOrMintQuantity: "0",
                                            sendOutput: TransactionOutput,
                                            note: tNote,
                                            amount_xqr: transactionData.amount.toString(),
                                            fee_xqr: transactionData.fee.toString()
                                        }

                                        var TransactionObject = {
                                            schema_version: schemaVersion,
                                            txid: transactionData.id,
                                            blockId: blockData.id,
                                            blockHeight: blockData.height,
                                            valid: false,
                                            invalidReason: 'Token NewOwner Failed - General Error',
                                            transactionDetails: TransactionDetails
                                        }
  
                                        await qdb.insertDocuments('transactions', TransactionObject);
                            
                                        resolve(false);
                        
                                    }
                            
                                }
                            
                            }
                    
                        })();
                    
                    
                    }
                    else if ((contractData.tp == 'GENESIS' || contractData.tp == 'MINT' || contractData.tp == 'BURN' || contractData.tp == 'PAUSE' || contractData.tp == 'RESUME' || contractData.tp == 'NEWOWNER') && transactionData.recipient != QaeMasterAddress)
                    {
                    
                        (async () => {
                    
                            var TransactionOutput = {
                                schema_version: schemaVersion,
                                address: transactionData.sender,
                                amount: "0"
                            }

                            var TransactionDetails = {
                                schema_version: schemaVersion,
                                transactionType: 'ERROR',
                                senderAddress: transactionData.sender,
                                tokenIdHex: '',
                                versionType: 1,
                                timestamp: transactionData.timestamp.human,
                                timestamp_unix: transactionData.timestamp.unix,
                                symbol: '',
                                name: '',
                                documentUri: '', 
                                decimals: 0,
                                genesisOrMintQuantity: "0",
                                sendOutput: TransactionOutput,
                                note: '',
                                amount_xqr: transactionData.amount.toString(),
                                fee_xqr: transactionData.fee.toString()
                            }

                            var TransactionObject = {
                                schema_version: schemaVersion,
                                txid: transactionData.id,
                                blockId: blockData.id,
                                blockHeight: blockData.height,
                                valid: false,
                                invalidReason: 'QAE1 Token - This command must be sent to the Master QAE Address: ' + QaeMasterAddress,
                                transactionDetails: TransactionDetails
                            }

                            await qdb.insertDocuments('transactions', TransactionObject);
                                            
                            // Invalid command
                            console.log("QAE1 - Invalid Command");
                    
                            resolve(false); 
                    
                        })();
                    
                    }
                    else
                    {
                
                        (async () => {
                    
                            var TransactionOutput = {
                                schema_version: schemaVersion,
                                address: transactionData.sender,
                                amount: "0"
                            }

                            var TransactionDetails = {
                                schema_version: schemaVersion,
                                transactionType: 'ERROR',
                                senderAddress: transactionData.sender,
                                tokenIdHex: '',
                                versionType: 1,
                                timestamp: transactionData.timestamp.human,
                                timestamp_unix: transactionData.timestamp.unix,
                                symbol: '',
                                name: '',
                                documentUri: '', 
                                decimals: 0,
                                genesisOrMintQuantity: "0",
                                sendOutput: TransactionOutput,
                                note: '',
                                amount_xqr: transactionData.amount.toString(),
                                fee_xqr: transactionData.fee.toString()
                            }

                            var TransactionObject = {
                                schema_version: schemaVersion,
                                txid: transactionData.id,
                                blockId: blockData.id,
                                blockHeight: blockData.height,
                                valid: false,
                                invalidReason: 'QAE1 Token - Invalid Command',
                                transactionDetails: TransactionDetails
                            }

                            await qdb.insertDocuments('transactions', TransactionObject);
                                            
                            // Invalid command
                            console.log("QAE1 - Invalid Command");
                    
                            resolve(false); 
                    
                        })();

                    }
                
                }

            }
            
        });
    
    };

    qaeSchema.prototype.indexDatabase = function (qdb)
    {
        
        return new Promise((resolve, reject) => {

            (async () => {

                var mclient = await qdb.connect();
                qdb.setClient(mclient);
                
                response = await qdb.createIndex('tokens', {"tokenDetails.tokenIdHex": 1}, true);
                response = await qdb.createIndex('tokens', {"tokenDetails.symbol": 1}, false);
                response = await qdb.createIndex('tokens', {"tokenDetails.name": 1}, false);
                response = await qdb.createIndex('tokens', {"tokenDetails.ownerAddress": 1}, false);
                response = await qdb.createIndex('tokens', {"type": 1}, false);
                response = await qdb.createIndex('tokens', {"lastUpdatedBlock": 1}, false);

                response = await qdb.createIndex('addresses', {"recordId": 1}, true);
                response = await qdb.createIndex('addresses', {"address": 1}, false);
                response = await qdb.createIndex('addresses', {"tokenIdHex": 1}, false);
                response = await qdb.createIndex('addresses', {"isOwner": 1}, false);
                response = await qdb.createIndex('addresses', {"lastUpdatedBlock": 1}, false);
            
                response = await qdb.createIndex('transactions', {"txid": 1}, true);
                response = await qdb.createIndex('transactions', {"blockId": 1}, false);
                response = await qdb.createIndex('transactions', {"blockHeight": 1}, false);
                response = await qdb.createIndex('transactions', {"transactionDetails.senderAddress": 1}, false);
                response = await qdb.createIndex('transactions', {"transactionDetails.tokenIdHex": 1}, false);
                response = await qdb.createIndex('transactions', {"transactionDetails.transactionType": 1}, false);
                response = await qdb.createIndex('transactions', {"transactionDetails.sendOutput.address": 1}, false);

                await qdb.close();
            
                resolve(true);

            })();

        });
    
    };

    return qaeSchema;

}());

exports.default = qaeSchema;
