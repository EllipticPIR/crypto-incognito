
import dotenv from 'dotenv';
dotenv.config();

import { createCI } from './index';

Object.defineProperty(global, 'btoa', {
	value: (str: string) => Buffer.from(str, 'binary').toString('base64'),
});

Object.defineProperty(global, 'atob', {
	value: (base64: string) => Buffer.from(base64, 'base64').toString('binary'),
});

(async () => {
	if(process.argv.length < 3) {
		console.log(`Usage: ts-node ./bench_balance.ts ADDRESS [END_POINT]`);
		return;
	}
	const apiID = process.env.CI_API_ID;
	const apiKey = process.env.CI_API_KEY;
	if(!apiID || !apiKey) {
		console.log('Please create .env file with CI_API_ID="YOUR_API_ID" and CI_API_KEY="YOUR_API_KEY".');
		return;
	}
	const address = process.argv[2];
	const endPoint = (process.argv.length > 3 ? process.argv[3] : undefined);
	const ci = await createCI(apiID, apiKey, undefined, endPoint);
	ci.logger = console.log;
	const utxos = await ci.findUTXOs(address);
	console.log(`                                                           TXID  |  vout  |            value`);
	console.log(`-----------------------------------------------------------------+--------+------------------`);
	let valueTotal = 0;
	for(const utxo of utxos) {
		valueTotal += utxo.value;
		console.log(`${utxo.txid} | ${utxo.vout.toLocaleString().padStart(6, ' ')} | ${(utxo.value*1e-8).toFixed(8).padStart(17, ' ')}`);
	}
	console.log(`-----------------------------------------------------------------+--------+------------------`);
	console.log(` Total: ${utxos.length.toLocaleString().padStart(55)}  |        | ${(valueTotal*1e-8).toFixed(8).padStart(17, ' ')}`);
})();

