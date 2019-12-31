# QAE  -- Version 1.0.1
Qredit Always Evolving Tokens

An API extension for the Qredit network to integrate Simple Token issuance and management

This must be running on a Qredit Relay or Full node.

Install Mongodb & Redis:  (Default settings are fine for testing)

```
apt-get install mongodb
apt-get install redis-server

```

Enable Webhooks in your Qredit Node:

```
vi .config/qredit-core/mainnet/.env
```

Make sure the env file has these items:

```
CORE_WEBHOOKS_ENABLED=true
CORE_WEBHOOKS_HOST=0.0.0.0
CORE_WEBHOOKS_PORT=4104
```

Clone the repository and run:

```
npm install
mkdir /etc/qae/
cp qae.ini.example /etc/qae/qae.ini
node qaeApiV2.js
```

The server runs on the port set in the ini file.

Currently the system supports the QAE-1 contract schema.   Additional schemas can be added later.

QAE-1 Contract Methods:

```
GENESIS - Create a new token
BURN - Destroy/Burn tokens from a contract
MINT - Create/Mint tokens into a contract
SEND - Send tokens from sender address to recipient address
PAUSE - Pause the contract.  Prevents any calls other than RESUME
RESUME - Resume the contract.
NEWOWNER - Change the owner of the contract.
FREEZE - Freeze balance for Token @ Address.
UNFREEZE - UnFreeze balance for Token @ Address.
```

JSON Variables:

GENESIS:  (Recipient Address is QAE Master - QjeTQp29p9xRvTcoox4chc6jQZAHwq87JC)

```
de = Decimal Places  (Integer: 0-8)
sy = Symbol / Ticker  (String: 3-8 characters)
na = Token Name  (String: 3-24 characters)
du = Document URI  (String:  Max 32 characters)  (Optional)
qt = Quantity (Integer)
no = Notes  (String: Max 32 Characters)  (Optional)
pa = Pausable (Boolean:  Default false)  (Optional)
mi = Mintable (Boolean:  Default false)  (Optional)
```

BURN:  (Recipient Address is QAE Master - QjeTQp29p9xRvTcoox4chc6jQZAHwq87JC)

```
id = tokenIdHex (Hexidecimal)
qt = Quantity (Integer)
no = Notes  (String: Max 32 Characters)  (Optional)
```

MINT:  (Recipient Address is QAE Master - QjeTQp29p9xRvTcoox4chc6jQZAHwq87JC)

```
id = tokenIdHex (Hexidecimal)
qt = Quantity (Integer)
no = Notes  (String: Max 32 Characters)  (Optional)
```

SEND:  (Recipent Address is whom you are sending Tokens to)

```
id = tokenIdHex (Hexidecimal)
qt = Quantity (Integer)
no = Notes  (String: Max 32 Characters)  (Optional)
```

PAUSE:  (Recipient Address is QAE Master - QjeTQp29p9xRvTcoox4chc6jQZAHwq87JC)

```
id = tokenIdHex (Hexidecimal)
no = Notes  (String: Max 32 Characters)  (Optional)
```

UNPAUSE:  (Recipient Address is QAE Master - QjeTQp29p9xRvTcoox4chc6jQZAHwq87JC)

```
id = tokenIdHex (Hexidecimal)
no = Notes  (String: Max 32 Characters)  (Optional)
```

NEWOWNER:  (Recipent Address is whom you are reassigning contract to)

```
id = tokenIdHex (Hexidecimal)
no = Notes  (String: Max 32 Characters)  (Optional)
```

FREEZE:  (Recipent Address is whom you want to freeze)

```
id = tokenIdHex (Hexidecimal)
no = Notes  (String: Max 32 Characters)  (Optional)
```

UNFREEZE:  (Recipent Address is whom you want to unfreeze)

```
id = tokenIdHex (Hexidecimal)
no = Notes  (String: Max 32 Characters)  (Optional)
```