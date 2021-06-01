Crypto Incognito Node.js / TypeScript Official Library
======================================================

[![Node.js CI](https://github.com/EllipticPIR/crypto-incognito/actions/workflows/node.js.yml/badge.svg)](https://github.com/EllipticPIR/crypto-incognito/actions/workflows/node.js.yml)
[![codecov](https://codecov.io/gh/EllipticPIR/crypto-incognito/branch/master/graph/badge.svg?token=RLBPZZ6ZHN)](https://codecov.io/gh/EllipticPIR/crypto-incognito)

*Crypto Incognito* is a web service that serves the Bitcoin's UTXO set database with **full anonymous access**.

Try online WebAssembly demo (needs API keys): https://demo.crypto-incognito.com/

Prerequisite
------------

To use this library, you need to build and install [libepir](https://github.com/EllipticPIR/libepir).
Please follow the instructions on the GitHub repository.

Install
-------

### From Git

```
$ git clone https://github.com/EllipticPIR/crypto-incognito.git
$ cd crypto-incognito
$ npm ci
```

### From NPM

```
$ npm install crypto-incognito
```

Usage
-----

Before continue to the next step, please create your own account at [our website](https://crypto-incognito.com/)
and create a API key piar (*API ID* and *API secret*).

The following code snippet may describe the usage of our library.

``` TypeScript
import CryptoIncognito from 'crypto-incognito';

const apiID = 'YOUR_API_ID';
const apiKey = 'YOUR_API_KEY';
const address = 'ADDRESS_TO_RETRIEVE';

(async () => {
	const ci = new CryptoIncognito(apiID, apiKey);
	await ci.init();
	const utxos = await ci.findUTXOs(address);
	console.log(utxos);
})();
```

To test the API, you can use the [bench_balance.ts](./src/bench_balance.ts).

```
$ export CI_API_ID=".."
$ export CI_API_KEY=".."
$ ts-node ./src/bench_balance.ts $CI_API_ID $CI_API_KEY "ADDRESS"
```

`ci.findUTXOs()` will conduct an interpolation search into our UTXO database to find out the location (index)
of UTXOs matching the specified address, and then fetch the UTXO body (`txid`, `vout`, `value`) from the server.

The computation may take tens of seconds to complete.
Please be patient.


