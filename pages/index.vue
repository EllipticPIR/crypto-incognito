<template>
	<v-app>
		<v-main>
			<v-container>
				<h1>Crypto Incognito Client Library (Browser Tests)</h1>
				
				<hr />
				
				<p>This page demonstrates the execution of the Crypto Incognito Client Library.</p>
				
				<h2>Step 1. Generate mG</h2>
				
				<p>Generate pre-computed values of mG (= G, 2G, ..., (0xffffff)G).</p>
				
				<ClickableButton value="Generate mG" :click="generateMG" />
				
				<DownArrow />
				
				<v-progress-linear :value="100 * pointsComputed / mmax" color="blue" height="50" striped class="my-4">
					<strong>
						<template v-if="pointsComputed != mmax">
							{{ pointsComputed.toLocaleString() }} of {{ mmax.toLocaleString() }} points computed
						</template>
						<template v-else>
							(Completed)
						</template>
					</strong>
				</v-progress-linear>
				
				<h2>Step 2. Register your account and get API key</h2>
				
				<p>Please visit <a href="https://crypto-incognito.com/" target="_blank">Crypto Incognito official site</a> to register your account and get the access API ID and key.</p>
				
				<p>Then, enter your API key:</p>
				
				<InputWithLabel v-model="apiID" label="API ID" />
				
				<InputWithLabel v-model="apiKey" label="API Key" />
				
				<h2>Step 3. Find UTXO location</h2>
				
				<InputWithLabel v-model="address" label="Address" />
				
				<InputWithLabel :value="coin" label="Coin Name" readonly />
				
				<InputWithLabel :value="addrType" label="Address Type" readonly />
				
				<InputWithLabel :value="arrayBufferToHex(addrBuf)" label="Hex Representation" readonly />
				
				<ClickableButton value="Find UTXO Location" :click="findUTXOLocation" />
				
				<DownArrow />
				
				<InputWithLabel :value="utxoLocationFound < 0 ? '(not found)' : utxoLocationFound.toLocaleString()" label="UTXO Location Found" readonly />
				
				<p>Computation time: {{ findUTXOLocationTime.toLocaleString() }} ms</p>
				
				<h2>Step 4. Get UTXO range</h2>
				
				<InputWithLabel v-model="utxoLocation" label="UTXO Location" />
				
				<ClickableButton value="Get UTXO Range" :click="getUTXORangeAt" />
				
				<DownArrow />
				
				<InputWithLabel :value="utxoRangeFound.begin < 0 ? '(not found)' : utxoRangeFound.begin.toLocaleString()" label="UTXO range begin found" readonly />
				
				<InputWithLabel :value="utxoRangeFound.count < 0 ? '(not found)' : utxoRangeFound.count.toLocaleString()" label="UTXO count found" readonly />
				
				<p>Computation time: {{ getUTXORangeAtTime.toLocaleString() }} ms</p>
				
				<h2>Step 5. Fetch UTXOs</h2>
				
				<InputWithLabel v-model="utxoRange.begin" label="UTXO Range Begin" />
				
				<InputWithLabel v-model="utxoRange.count" label="UTXO Count" />
				
				<ClickableButton value="Fetch UTXOs" :click="getUTXOsInRange" />
				
				<DownArrow />
				
				<v-data-table :headers="utxoHeaders" :items="utxos">
					<template v-slot:item.value="{ value }">
						{{ (1e-8 * value).toFixed(8) }}
					</template>
					<template v-slot:body.append>
						<tr>
							<th colspan="2" class="text-right">#UTXOs = {{ utxos.length }}</th>
							<th>{{ (utxos.reduce((acc, utxo) => acc + utxo.value, 0) * 1e-8).toFixed(8) }}</th>
						</tr>
					</template>
				</v-data-table>
				
				<p>Computation time: {{ getUTXOsInRangeTime.toLocaleString() }} ms</p>
				
				<hr />
				
				<footer class="mb-4">
					Copyright &copy; Crypto Incognito 2021. All rights reserved.
				</footer>
			</v-container>
		</v-main>
	</v-app>
</template>

<style type="text/css">
	h2 {
		margin-top: 4rem;
	}
</style>

<script lang="ts">
import Vue, { PropType } from 'vue'
import Dexie from 'dexie';
import { sha256 } from 'hash-wasm';

import ClickableButton from 'epir/components/ClickableButton.vue';
import InputWithLabel from 'epir/components/InputWithLabel.vue';
import { EpirBase, DecryptionContextBase, DEFAULT_MMAX } from 'epir/dist/types';
import { time, arrayBufferToHex } from 'epir/dist/util';
import {
	createEpir, createDecryptionContext,
	loadDecryptionContextFromIndexedDB, saveDecryptionContextToIndexedDB,
	SelectorFactory
} from '../node_modules/epir/src_ts/wasm';
import { CryptoIncognito, NonceGeneratorMutex, UTXOEntry, decodeAddress } from '../src/CryptoIncognito';

export type DataType = {
	epir: EpirBase | null;
	decCtx: DecryptionContextBase | null;
	ci: CryptoIncognito | null;
	pointsComputed: number;
	mmax: number;
	apiID: string;
	apiKey: string;
	address: string;
	coin: string;
	addrType: string;
	addrBuf: ArrayBuffer;
	utxoLocationFound: number;
	findUTXOLocationTime: number;
	utxoLocation: string;
	utxoRangeFound: { begin: number, count: number };
	getUTXORangeAtTime: number;
	utxoRange: { begin: string, count: string };
	getUTXOsInRangeTime: number;
	utxoHeaders: any[];
	utxos: UTXOEntry[];
};

export default Vue.extend({
	components: {
		ClickableButton,
		InputWithLabel,
	},
	data(): DataType {
		return {
			epir: null,
			decCtx: null,
			ci: null,
			pointsComputed: 0,
			mmax: DEFAULT_MMAX,
			apiID: '',
			apiKey: '',
			address: '',
			coin: 'unknown',
			addrType: 'unknown',
			addrBuf: new ArrayBuffer(20),
			utxoLocationFound: -1,
			findUTXOLocationTime: -1,
			utxoLocation: '',
			utxoRangeFound: { begin: -1, count: -1 },
			getUTXORangeAtTime: -1,
			utxoRange: { begin: '', count: '' },
			getUTXOsInRangeTime: -1,
			utxoHeaders: [
				{ text: 'Transaction ID', value: 'txid' },
				{ text: 'vout',           value: 'vout' },
				{ text: 'value',          value: 'value' },
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
	methods: {
		arrayBufferToHex: arrayBufferToHex,
		async createCI(decCtx: DecryptionContextBase) {
			this.decCtx = decCtx;
			this.epir = await createEpir();
			this.ci = new CryptoIncognito(this.epir, this.decCtx, this.apiID, this.apiKey, new NonceGeneratorMutex());
			this.ci.logger = console.log;
			this.ci.selectorFactory = new SelectorFactory(true, this.ci.privkey);
			await this.ci.selectorFactory.fill();
		},
		async loadMGIfExists() {
			const decCtx = await loadDecryptionContextFromIndexedDB();
			if(!decCtx) return;
			this.pointsComputed = DEFAULT_MMAX;
			await this.createCI(decCtx);
		},
		async generateMG() {
			const decCtx = await createDecryptionContext({ cb: (pointsComputed: number) => {
				this.pointsComputed = pointsComputed;
				const progress = 100 * pointsComputed / DEFAULT_MMAX;
			}, interval: 10 * 1000 }, DEFAULT_MMAX);
			saveDecryptionContextToIndexedDB(decCtx);
			await this.createCI(decCtx);
		},
		decodeAddress() {
			const decoded = decodeAddress(this.address);
			if(!decoded) {
				this.coin = 'unknown';
				this.addrType = 'unknown';
				this.addrBuf = new ArrayBuffer(20);
			} else {
				this.coin = decoded.coin;
				this.addrType = decoded.addrType;
				this.addrBuf = decoded.buf;
			}
		},
		async findUTXOLocation() {
			if(!this.ci) {
				alert('Please generate mG first.');
				return;
			}
			try {
				const begin = time();
				this.utxoLocation =
					(this.utxoLocationFound =
						await this.ci.findUTXOLocation(this.coin, this.addrType, this.addrBuf)).toString();
				this.findUTXOLocationTime = time() - begin;
			} catch(e) {
				console.log(e.stack);
				alert(e.toString());
			}
		},
		async getUTXORangeAt() {
			if(!this.ci) {
				alert('Please generate mG first.');
				return;
			}
			try {
				const begin = time();
				this.utxoRangeFound = await this.ci.getUTXORangeAt(this.coin, this.addrType, parseInt(this.utxoLocation));
				this.utxoRange.begin = this.utxoRangeFound.begin.toString();
				this.utxoRange.count = this.utxoRangeFound.count.toString();
				this.getUTXORangeAtTime = time() - begin;
			} catch(e) {
				console.log(e.stack);
				alert(e.toString());
			}
		},
		async getUTXOsInRange() {
			if(!this.ci) {
				alert('Please generate mG first.');
				return;
			}
			try {
				const beginTime = time();
				this.utxos = [];
				const begin = parseInt(this.utxoRange.begin);
				const count = parseInt(this.utxoRange.count);
				const utxoSetInfoFind = await this.ci.getUTXOSetInfo(this.coin, this.addrType, 'find');
				for(let i=begin; i<begin+count; i++) {
					this.utxos.push(await this.ci.getUTXOAt(utxoSetInfoFind, this.coin, this.addrType, i));
				}
				this.getUTXOsInRangeTime = time() - beginTime;
			} catch(e) {
				console.log(e.stack);
				alert(e.toString());
			}
		},
	},
})
</script>

