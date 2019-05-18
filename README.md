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