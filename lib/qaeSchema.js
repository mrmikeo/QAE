// QAE-1 Schema and Functions
// ==========================

/* Use Interfaces for Objects */

const implementjs 			= require('implement-js')
const implement 			= implementjs.default
const { Interface, type } 	= implementjs

const Big 		 			= require('big.js');
//const uuidv4 	 			= require('uuid/v4');
const crypto 				= require('crypto');

var qaeSchema = /** @class */ (function () 
{

	/* Vars */
	
	const QaeMasterAddress = "QjeTQp29p9xRvTcoox4chc6jQZAHwq87JC";
	
	const schemaVersion = 10;

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
    	timestamp: type('string'),
    	timestamp_unix: type('number'),
    	symbol: type('string'),
    	name: type('string'),
    	documentUri: type('string'), 
    	decimals: type('number'),
    	genesisOrMintQuantity: type('string'),
    	sendOutput: type('object', QaeTransactionOutput),
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
    	genesisQuantity: type('string')
	},{
		error: true,
		strict: true
	})
	
	const QaeTokenStats = Interface('QaeTokenStats')({
		schema_version: type('number'),
    	block_created: type('number'),
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
    	tokenDecimals: type('number')
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
		
			if (vendorData && vendorData.qae1)
			{
		
				var contractData = vendorData.qae1;
				
				// Some Error Checking
				
				if (Big(contractData.qt).lt(0))
				{
				
					reject(false);
					return;
				
				}
				
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
					
					var tSymbol = contractData.sy;
					var tName = contractData.na;
					
					var tDecimals = parseInt(contractData.de);
					
					if (contractData.du) tDocumentUri = contractData.du
					else tDocumentUri = '';

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
    					genesisQuantity: genesisAmount.toString()
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
    					block_created: blockData.height,
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
    					tokenDecimals: tDecimals
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
						
							var mclient = await qdb.connect();
							qdb.setClient(mclient);
					
							await qdb.insertDocuments('tokens', TokenObject);
							await qdb.insertDocuments('addresses', AddressObject);
							await qdb.insertDocuments('transactions', TransactionObject);
							
							await qdb.close();
							
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
						
							var mclient = await qdb.connect();
							qdb.setClient(mclient);

							await qdb.insertDocuments('transactions', TransactionObject);
							
							await qdb.close();
							
							reject(false);
					
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
					
						var mclient = await qdb.connect();
						qdb.setClient(mclient);
						
						var findToken = await qdb.findDocument('tokens', {"tokenDetails.tokenIdHex": tokenId});

						await qdb.close();
					
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
						
							var mclient = await qdb.connect();
							qdb.setClient(mclient);

							await qdb.insertDocuments('transactions', TransactionObject);
							
							await qdb.close();

							console.log('Token does not exist');
							reject(false);
							return;
								
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
						
							var mclient = await qdb.connect();
							qdb.setClient(mclient);

							await qdb.insertDocuments('transactions', TransactionObject);
							
							await qdb.close();


							console.log('Mint failed:  Not the token owner');
							reject(false);
							return;
							
						}


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
											
							var mclient = await qdb.connect();
							qdb.setClient(mclient);

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
						
								var mclient = await qdb.connect();
								qdb.setClient(mclient);

								await qdb.insertDocuments('transactions', TransactionObject);
							
								await qdb.close();
							
								console.log('Error: Mint to addresses not found');
								reject(false);
								return;
							
							}
								
								
							await qdb.insertDocuments('transactions', TransactionObject);
													
							//var newBalance = new Big(findAddress.tokenBalance).plus(mintAmount);

							var recipientbalance = await qdb.findDocumentBigSum('transactions', {"transactionDetails.tokenIdHex": tokenId, "valid": true, "transactionDetails.sendOutput.address": findAddress.address}, 'transactionDetails.sendOutput.amount');

							await qdb.updateDocument('addresses', {"recordId": recordId }, {"tokenBalance": recipientbalance.toString() });

							//var newValidTxns = parseInt(findToken.tokenStats.qty_valid_txns_since_genesis) + 1;
							
							var newValidTxns = await qdb.findDocumentCount('transactions', {"transactionDetails.tokenIdHex": tokenId, "valid": true });

							
							var totalMinted = new Big(findToken.tokenStats.qty_token_minted).plus(mintAmount);
							var circSupply = new Big(findToken.tokenStats.qty_token_circulating_supply).plus(mintAmount);
							//var xqrspent = new Big(findToken.tokenStats.qty_xqr_spent).plus(transactionData.amount);
							
							//await qdb.updateDocument('addresses', {"recordId": recordId }, {"tokenBalance": newBalance.toString() });
							
							
							var xqrspent = await qdb.findDocumentBigSum('transactions', {"transactionDetails.tokenIdHex": tokenId}, 'transactionDetails.amount_xqr');
							
							await qdb.updateDocument('tokens', {"tokenDetails.tokenIdHex":  tokenId }, {"lastUpdatedBlock": blockData.height, "tokenStats.block_last_active_mint": blockData.height, "tokenStats.qty_valid_txns_since_genesis": newValidTxns, "tokenStats.qty_token_minted": totalMinted.toString(), "tokenStats.qty_token_circulating_supply": circSupply.toString(), "tokenStats.qty_xqr_spent": xqrspent.toString()});
					
							

							await qdb.close();
							
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
						
							var mclient = await qdb.connect();
							qdb.setClient(mclient);

							await qdb.insertDocuments('transactions', TransactionObject);
							
							await qdb.close();
							
							reject(false);
						
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
					
						var mclient = await qdb.connect();
						qdb.setClient(mclient);
						
						var findToken = await qdb.findDocument('tokens', {"tokenDetails.tokenIdHex": tokenId});
							
						await qdb.close();
					
					
					
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
						
							var mclient = await qdb.connect();
							qdb.setClient(mclient);

							await qdb.insertDocuments('transactions', TransactionObject);
							
							await qdb.close();


							console.log('Token does not exist');
							reject(false);
							return;
							
						}

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
											
							var mclient = await qdb.connect();
							qdb.setClient(mclient);
							
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
						
								var mclient = await qdb.connect();
								qdb.setClient(mclient);

								await qdb.insertDocuments('transactions', TransactionObject);
							
								await qdb.close();
							
								console.log('Error: Sender addresses not found');
								reject(false);
								return;
							
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
						
								var mclient = await qdb.connect();
								qdb.setClient(mclient);

								await qdb.insertDocuments('transactions', TransactionObject);
							
								await qdb.close();

								console.log('Error: Sender does not have enough funds');
								reject(false);
								return;
							
							}
							
							await qdb.insertDocuments('transactions', TransactionObject);
							
							//var newSenderBalance = new Big(findSenderAddress.tokenBalance).minus(sendAmount);
							//await qdb.updateDocument('addresses', {"recordId": srecordId }, {"tokenBalance": newSenderBalance.toString() });
							
							var senderbalance = await qdb.findDocumentBigSum('transactions', {"transactionDetails.tokenIdHex": tokenId, "valid": true, "transactionDetails.sendOutput.address": findSenderAddress.address}, 'transactionDetails.sendOutput.amount');

							var senderbalancesend = await qdb.findDocumentBigSum('transactions', {"transactionDetails.tokenIdHex": tokenId, "valid": true, "transactionDetails.senderAddress": findSenderAddress.address, "transactionDetails.transactionType": "SEND"}, 'transactionDetails.sendOutput.amount');

							var totalsenderbalance = new Big(senderbalance).minus(senderbalancesend);
							
				
							await qdb.updateDocument('addresses', {"recordId": srecordId }, {"tokenBalance": totalsenderbalance.toString() });
							
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
    								tokenDecimals: tDecimals
								}

								try 
								{
					
									implement(QaeAddressObject)(AddressObject);

								} catch (e) {
					
									console.log(e);
					
								}
								
								await qdb.insertDocuments('addresses', AddressObject);
								
								//var newTokenAddrs = parseInt(findToken.tokenStats.qty_valid_token_addresses) + 1;	
								
							}
							else 
							{
							
								// Update Record
								
								//var newRecipientBalance = new Big(findRecipientAddress.tokenBalance).plus(sendAmount);
								
								//await qdb.updateDocument('addresses', {"recordId": rrecordId }, {"tokenBalance": newRecipientBalance.toString() });
							
								var recipientbalance = await qdb.findDocumentBigSum('transactions', {"transactionDetails.tokenIdHex": tokenId, "valid": true, "transactionDetails.sendOutput.address": findRecipientAddress.address}, 'transactionDetails.sendOutput.amount');

								await qdb.updateDocument('addresses', {"recordId": rrecordId }, {"tokenBalance": recipientbalance.toString() });

								//await qdb.updateDocument('addresses', {"recordId": rrecordId }, {"tokenBalance": senderbalance.toString() });
							
							
								//var newTokenAddrs = parseInt(findToken.tokenStats.qty_valid_token_addresses);	
								
							}
							
							
							
							var newTokenAddrs = await qdb.findDocumentCount('addresses', {"tokenIdHex": tokenId });

							var newValidTxns = await qdb.findDocumentCount('transactions', {"transactionDetails.tokenIdHex": tokenId, "valid": true });

							
							//var newValidTxns = parseInt(findToken.tokenStats.qty_valid_txns_since_genesis) + 1;					

							var xqrspent = await qdb.findDocumentBigSum('transactions', {"transactionDetails.tokenIdHex": tokenId}, 'transactionDetails.amount_xqr');

							//var xqrspent = new Big(findToken.tokenStats.qty_xqr_spent).plus(transactionData.amount);
							
							await qdb.updateDocument('tokens', {"tokenDetails.tokenIdHex": tokenId }, {"lastUpdatedBlock": blockData.height, "tokenStats.block_last_active_send": blockData.height, "tokenStats.qty_valid_txns_since_genesis": newValidTxns, "tokenStats.qty_valid_token_addresses": newTokenAddrs, "tokenStats.qty_xqr_spent": xqrspent.toString() });
					
							

							await qdb.close();
							
							resolve(true);
											
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
						
							var mclient = await qdb.connect();
							qdb.setClient(mclient);

							await qdb.insertDocuments('transactions', TransactionObject);
							
							await qdb.close();

							reject(false);
						
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
					
						var mclient = await qdb.connect();
						qdb.setClient(mclient);
					
						var findToken = await qdb.findDocument('tokens', {"tokenDetails.tokenIdHex": tokenId});
	
						var srawRecordId = transactionData.sender + '.' + tokenId;
						var srecordId = crypto.createHash('md5').update(srawRecordId).digest('hex');
							
						var findSenderAddress = await qdb.findDocument('addresses', {"recordId": srecordId});
							
						await qdb.close();

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
						
							var mclient = await qdb.connect();
							qdb.setClient(mclient);

							await qdb.insertDocuments('transactions', TransactionObject);
							
							await qdb.close();

							console.log('Token does not exist');
							reject(false);
							return;
							
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
						
							var mclient = await qdb.connect();
							qdb.setClient(mclient);

							await qdb.insertDocuments('transactions', TransactionObject);
							
							await qdb.close();

							console.log('Burn failed:  Not the token owner');
							reject(false);
							return;
							
						}
					
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
						
							var mclient = await qdb.connect();
							qdb.setClient(mclient);

							await qdb.insertDocuments('transactions', TransactionObject);
							
							await qdb.close();
							
														
							console.log('Error: Sender addresses not found');
							reject(false);
							return;
							
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
						
							var mclient = await qdb.connect();
							qdb.setClient(mclient);

							await qdb.insertDocuments('transactions', TransactionObject);
							
							await qdb.close();
							
							
							console.log('Error: Sender does not have enough funds');
							reject(false);
							return;
							
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
    						genesisOrMintQuantity: burnAmount.toString(),
    						sendOutput: TransactionOutput,
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
											
							var mclient = await qdb.connect();
							qdb.setClient(mclient);

							var rawRecordId = transactionData.sender + '.' + tokenId;
							var recordId = crypto.createHash('md5').update(rawRecordId).digest('hex');
							
							var findAddress = await qdb.findDocument('addresses', {"recordId": recordId});
							if (findAddress == null)
							{
							
								console.log('Error: Mint to addresses not found');
								reject(false);
								return;
							
							}
							
							await qdb.insertDocuments('transactions', TransactionObject);
							
							//var newBalance = new Big(findAddress.tokenBalance).plus(burnAmount);
							
							//var newValidTxns = parseInt(findToken.tokenStats.qty_valid_txns_since_genesis) + 1;

							var newValidTxns = await qdb.findDocumentCount('transactions', {"transactionDetails.tokenIdHex": tokenId, "valid": true });

							var recipientbalance = await qdb.findDocumentBigSum('transactions', {"transactionDetails.tokenIdHex": tokenId, "valid": true, "transactionDetails.sendOutput.address": findAddress.address}, 'transactionDetails.sendOutput.amount');

							await qdb.updateDocument('addresses', {"recordId": recordId }, {"tokenBalance": recipientbalance.toString() });
							
							var totalBurned = new Big(findToken.tokenStats.qty_token_burned).plus(absBurnAmount);
							var circSupply = new Big(findToken.tokenStats.qty_token_circulating_supply).plus(burnAmount);
							//var xqrspent = new Big(findToken.tokenStats.qty_xqr_spent).plus(transactionData.amount);
							
							//await qdb.updateDocument('addresses', {"recordId": recordId }, {"tokenBalance": newBalance.toString() });
							
							
							
							var xqrspent = await qdb.findDocumentBigSum('transactions', {"transactionDetails.tokenIdHex": tokenId}, 'transactionDetails.amount_xqr');
							
							await qdb.updateDocument('tokens', {"tokenDetails.tokenIdHex": tokenId }, {"lastUpdatedBlock": blockData.height, "tokenStats.qty_valid_txns_since_genesis": newValidTxns, "tokenStats.qty_token_burned": totalBurned.toString(), "tokenStats.qty_token_circulating_supply": circSupply.toString(), "tokenStats.qty_xqr_spent": xqrspent.toString()});
					
							

							await qdb.close();
							
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
						
							var mclient = await qdb.connect();
							qdb.setClient(mclient);

							await qdb.insertDocuments('transactions', TransactionObject);
							
							await qdb.close();

							reject(false);
						
						}
					
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
    						transactionType: 'UNKNOWN',
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
						
						var mclient = await qdb.connect();
						qdb.setClient(mclient);

						await qdb.insertDocuments('transactions', TransactionObject);
							
						await qdb.close();
				
				
						// Invalid command
						console.log("QAE1 - Invalid Command");
					
						reject('Invalid Command'); 
						return;
					
					})();

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

				response = await qdb.createIndex('addresses', {"recordId": 1}, true);
				response = await qdb.createIndex('addresses', {"address": 1}, false);
				response = await qdb.createIndex('addresses', {"tokenIdHex": 1}, false);
				response = await qdb.createIndex('addresses', {"isOwner": 1}, false);
			
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
