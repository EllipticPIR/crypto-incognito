<template>
	<b-container>
		<h1>Crypto Incognito Client Library (Browser Tests)</h1>
		
		<hr />
		
		<p>This page demonstrates the execution of the Crypto Incognito Client Library.</p>
		
		<h2>Step 1. Generate mG</h2>
		
		<p>Generate pre-computed values of mG (= G, 2G, ..., (0xffffff)G).</p>
		
		<div class="text-center">
			<b-button @click="generateMG">Generate mG</b-button>
		</div>
		
		<div class="my-4">
			<h3>The mG generation progress</h3>
			<b-progress :max="mmax" height="2rem" animated>
				<b-progress-bar :value="pointsComputed" style="font-size:150%;">
					<template v-if="pointsComputed != mmax">
						Computed {{ pointsComputed.toLocaleString() }} of {{ mmax.toLocaleString() }} points
					</template>
					<template v-else>
						(Completed)
					</template>
				</b-progress-bar>
			</b-progress>
		</div>
		
		<h2>Step 2. Register your account and get API key</h2>
		
		<p>Please visit <a href="https://crypto-incognito.com/" target="_blank">Crypto Incognito official site</a> to register your account and get the access API ID and key.</p>
		
		<p>Then, enter your API key:</p>
		
		<b-form-group label="API ID">
			<b-form-input v-model="apiID"></b-form-input>
		</b-form-group>
		
		<b-form-group label="API Key">
			<b-form-input v-model="apiKey"></b-form-input>
		</b-form-group>
		
		<h2>Step 3. Call APIs to retrieve encrypted UTXO data</h2>
		
		<b-form-group label="Address">
			<b-form-input v-model="address"></b-form-input>
		</b-form-group>
		
		<b-form-group label="Coin Name">
			<b-form-input :value="coin" disabled></b-form-input>
		</b-form-group>
		
		<b-form-group label="Address Type">
			<b-form-input :value="addrType" disabled></b-form-input>
		</b-form-group>
		
		<b-form-group label="Hex Representation">
			<b-form-input :value="addrBuf.toString('hex')" disabled></b-form-input>
		</b-form-group>
		
		<div class="text-center">
			<b-button @click="findUTXOs">Fetch UTXO data</b-button>
		</div>
		
		<h2>Step 4. Consult fetched data</h2>
		
		<b-table striped hover :items="utxos" :fields="utxoFields"></b-table>
		
		<hr />
		
		<h2>Debug Console</h2>
		<textarea id="console" :value="console.join('\n')" rows="20" class="w-100" disabled />
		
		<hr />
		
		<footer class="mb-4">
			Copyright &copy; Crypto Incognito 2021. All rights reserved.
		</footer>
	</b-container>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue'
import Dexie from 'dexie';
import { sha256 } from 'hash-wasm';

import { DEFAULT_MMAX } from '../node_modules/epir/src_ts/EpirBase';
import { EpirBase, DecryptionContextBase } from '../node_modules/epir/src_ts/EpirBase';
import { createEpir, createDecryptionContext } from '../node_modules/epir/src_ts/wasm';
import { CryptoIncognito, UTXOEntry } from '../src/CryptoIncognito';

const MMAX = 1 << 24;

interface MGDatabaseElement {
	key: number;
	value: Uint8Array;
}

class MGDatabase extends Dexie {
	mG: Dexie.Table<MGDatabaseElement, number>;
	constructor() {
		super('mG.bin');
		this.version(1).stores({
			mG: 'key',
		});
		this.mG = this.table('mG');
	}
}

export type DataType = {
	epir: EpirBase | null;
	decCtx: DecryptionContextBase | null;
	ci: CryptoIncognito | null,
	console: string[];
	pointsComputed: number;
	mmax: number;
	apiID: string;
	apiKey: string;
	address: string;
	coin: string;
	addrType: string;
	addrBuf: Buffer;
	utxoFields: any[];
	utxos: UTXOEntry[];
};

export default Vue.extend({
	data(): DataType {
		return {
			epir: null,
			decCtx: null,
			ci: null,
			console: [],
			pointsComputed: 0,
			mmax: MMAX,
			apiID: '',
			apiKey: '',
			address: '',
			coin: 'unknown',
			addrType: 'unknown',
			addrBuf: Buffer.alloc(20),
			utxoFields: [
				{ key: 'txid', label: 'Transaction ID' },
				{ key: 'vout' },
				{ key: 'value', formatter: (value: number) => (value * 1e-8).toFixed(8) },
			],
			utxos: [],
		}
	},
	async mounted() {
		if(localStorage.apiID) this.apiID = localStorage.apiID;
		if(localStorage.apiKey) this.apiKey = localStorage.apiKey;
		if(localStorage.address) this.address = localStorage.address;
		await this.loadMGIfExists();
	},
	watch: {
		apiID(newApiID) {
			localStorage.apiID = newApiID;
		},
		apiKey(newApiKey) {
			localStorage.apiKey = newApiKey;
		},
		address(newAddress) {
			localStorage.address = newAddress;
			this.decodeAddress();
		},
	},
	updated() {
		const elem = this.$el.querySelector('#console');
		if(elem) {
			elem.scrollTop = elem.scrollHeight;
		}
	},
	methods: {
		log(str: string) {
			this.console.push(str);
		},
		async createCI(decCtx: DecryptionContextBase) {
			this.decCtx = decCtx;
			this.epir = await createEpir();
			this.ci = new CryptoIncognito(this.epir, this.decCtx, this.apiID, this.apiKey);
			this.ci.logger = this.log;
		},
		async loadMGIfExists() {
			const db = new MGDatabase();
			const mGDB = await db.mG.get(0);
			if(!mGDB) return;
			const mCount = mGDB.value.length / 36;
			if(mCount != MMAX) return;
			const decCtx = await createDecryptionContext(mGDB.value);
			this.pointsComputed = mCount;
			await this.createCI(decCtx);
		},
		async generateMG() {
			this.log('Generating mG..');
			const decCtx = await createDecryptionContext({ cb: (pointsComputed: number) => {
				this.pointsComputed = pointsComputed;
				const progress = 100 * pointsComputed / MMAX;
				this.log(`Generated ${pointsComputed.toLocaleString()} of ${MMAX.toLocaleString()} points (${progress.toFixed(2)}%)..`);
			}, interval: 10 * 1000 }, MMAX);
			const db = new MGDatabase();
			await db.mG.put({ key: 0, value: decCtx.getMG() });
			await this.createCI(decCtx);
		},
		decodeAddress() {
			const decoded = CryptoIncognito.decodeAddress(this.address);
			if(!decoded) {
				this.coin = 'unknown';
				this.addrType = 'unknown';
				this.addrBuf = Buffer.alloc(20);
			} else {
				this.coin = decoded.coin;
				this.addrType = decoded.addrType;
				this.addrBuf = decoded.buf;
			}
		},
		async findUTXOs() {
			if(!this.ci) {
				alert('Please generate mG first.');
				return;
			}
			try {
				this.utxos = await this.ci.findUTXOs(this.address);
			} catch(e) {
				this.log(e.stack);
				alert(e.toString());
			}
		},
	},
})
</script>

