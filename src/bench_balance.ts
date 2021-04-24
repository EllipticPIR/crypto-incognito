
import CryptoIncognito from './index';

(async () => {
	if(process.argv.length < 5) {
		console.log(`Usage: ts-node ./bench_balance.ts API_ID API_KEY ADDRESS [END_POINT]`);
		return;
	}
	const apiID   = process.argv[2];
	const apiKey  = process.argv[3];
	const address = process.argv[4];
	const endPoint = (process.argv.length > 5 ? process.argv[5] : undefined);
	const ci = new CryptoIncognito(apiID, apiKey, endPoint);
	ci.debug = true;
	await ci.init();
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

