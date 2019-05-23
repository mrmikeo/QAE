# QSLT
Qredit Simple Ledger Tokens

An API extension for the Qredit network to integrate Simple Token issuance and management

Currently tested on Nodejs v9.11.2

```
curl -sL https://deb.nodesource.com/setup_9.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Install Mongodb & Redis:  (Default settings are fine for testing)

```
apt-get install mongodb
apt-get install redis-server

```

Clone the repository, install pages, set config, and run:

```
npm install
mkdir /etc/qslt/
cp qslt.ini.example /etc/qslt/qslt.ini
node qsltApi.js
```

The server runs on the port set in the ini file.

Currently the system supports the QAE-1 contract schema.   Additional schemas can be added later.

QAE-1 Contract Methods:

GENESIS - Create a new token
BURN - Destroy/Burn tokens from a contract
MINT - Create/Mint tokens into a contract
SEND - Send tokens from sender address to recipient address
PAUSE - Pause the contract.  Prevents any calls other than RESUME
RESUME - Resume the contract.
NEWOWNER - Change the owner of the contract.


JSON Variables:

GENESIS:

de = Decimal Places  (Integer: 0-8)
sy = Symbol / Ticker  (String: 3-8 characters)
na = Token Name  (String: 3-24 characters)
du = Document URI  (String:  Max 32 characters)
qt = Quantity (Integer)


BURN:

id = tokenIdHex (Hexidecimal)
qt = Quantity (Integer)


MINT:

id = tokenIdHex (Hexidecimal)
qt = Quantity (Integer)


SEND:

id = tokenIdHex (Hexidecimal)
qt = Quantity (Integer)


PAUSE:

id = tokenIdHex (Hexidecimal)


UNPAUSE:

id = tokenIdHex (Hexidecimal)


NEWOWNER:

id = tokenIdHex (Hexidecimal)


