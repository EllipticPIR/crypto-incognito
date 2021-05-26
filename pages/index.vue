<template>
	<b-container>
		<b-modal id="modal-loading" centered hide-header hide-footer no-close-on-backdrop title="Loading...">
			<p class="my-4 text-center">Computing your query...<br />(please wait a minute)</p>
		</b-modal>
		<h1>Crypto Incognito Client Library (Browser Tests)</h1>
		
		<hr />
		
		<p>This page demonstrates the execution of the Crypto Incognito Client Library.</p>
		
		<h2>Step 1. Generate mG</h2>
		
		<p>Generate pre-computed values of mG (= G, 2G, ..., (0xffffff)G).</p>
		
		<ClickableButton value="Generate mG" :click="generateMG" />
		
		<DownArrow />
		
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
		
		<h2>Step 2. Register your account and get API key</h2>
		
		<p>Please visit <a href="https://crypto-incognito.com/" target="_blank">Crypto Incognito official site</a> to register your account and get the access API ID and key.</p>
		
		<p>Then, enter your API key:</p>
		
		<b-form-group label="API ID">
			<b-form-input v-model="apiID"></b-form-input>
		</b-form-group>
		
		<b-form-group label="API Key">
			<b-form-input v-model="apiKey"></b-form-input>
		</b-form-group>
		
		<h2>Step 3. Find UTXO location</h2>
		
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
		
		<ClickableButton value="Find UTXO Location" :click="findUTXOLocation" />
		
		<DownArrow />
		
		<b-form-group label="UTXO location found">
			<b-form-input :value="utxoLocationFound < 0 ? '(not found)' : utxoLocationFound.toLocaleString()" disabled></b-form-input>
		</b-form-group>
		
		<p>Computation time: {{ findUTXOLocationTime.toLocaleString() }} ms</p>
		
		<h2>Step 4. Get UTXO range</h2>
		
		<b-form-group label="UTXO location">
			<b-form-input v-model="utxoLocation"></b-form-input>
		</b-form-group>
		
		<ClickableButton value="Get UTXO Range" :click="getUTXORangeAt" />
		
		<DownArrow />
		
		<b-form-group label="UTXO range begin found">
			<b-form-input :value="utxoRangeFound.begin < 0 ? '(not found)' : utxoRangeFound.begin.toLocaleString()" disabled></b-form-input>
		</b-form-group>
		
		<b-form-group label="UTXO count found">
			<b-form-input :value="utxoRangeFound.count < 0 ? '(not found)' : utxoRangeFound.count.toLocaleString()" disabled></b-form-input>
		</b-form-group>
		
		<p>Computation time: {{ getUTXORangeAtTime.toLocaleString() }} ms</p>
		
		<h2>Step 5. Fetch UTXOs</h2>
		
		<b-form-group label="UTXO range begin">
			<b-form-input v-model="utxoRange.begin"></b-form-input>
		</b-form-group>
		
		<b-form-group label="UTXO count">
			<b-form-input v-model="utxoRange.count"></b-form-input>
		</b-form-group>
		
		<ClickableButton value="Fetch UTXOs" :click="getUTXOsInRange" />
		
		<DownArrow />
		
		<b-table striped hover :items="utxos" :fields="utxoFields" class="my-4">
			<template v-slot:custom-foot="data">
				<b-tr>
					<b-th colspan="2" class="text-right">#UTXOs = {{ utxos.length }}</b-th>
					<b-th>{{ (utxos.reduce((acc, utxo) => acc + utxo.value, 0) * 1e-8).toFixed(8) }}</b-th>
				</b-tr>
			</template>
		</b-table>
		
		<p>Computation time: {{ getUTXOsInRangeTime.toLocaleString() }} ms</p>
		
		<hr />
		
		<h2>Debug Console</h2>
		<textarea id="console" :value="console.join('\n')" rows="20" class="w-100" disabled />
		
		<hr />
		
		<footer class="mb-4">
			Copyright &copy; Crypto Incognito 2021. All rights reserved.
		</footer>
	</b-container>
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
import { EpirBase, DecryptionContextBase, DEFAULT_MMAX } from '../node_modules/epir/src_ts/EpirBase';
import { time } from '../node_modules/epir/src_ts/util';
import {
	createEpir, createDecryptionContext,
	loadDecryptionContextFromIndexedDB, saveDecryptionContextToIndexedDB
} from '../node_modules/epir/src_ts/wasm';
import { CryptoIncognito, NonceGeneratorMutex, UTXOEntry, decodeAddress } from '../src/CryptoIncognito';

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
	addrBuf: ArrayBuffer;
	utxoLocationFound: number;
	findUTXOLocationTime: number;
	utxoLocation: string;
	utxoRangeFound: { begin: number, count: number };
	getUTXORangeAtTime: number;
	utxoRange: { begin: string, count: string };
	getUTXOsInRangeTime: number;
	utxoFields: any[];
	utxos: UTXOEntry[];
};

export default Vue.extend({
	components: {
		ClickableButton,
	},
	data(): DataType {
		return {
			epir: null,
			decCtx: null,
			ci: null,
			console: [],
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
			this.ci = new CryptoIncognito(this.epir, this.decCtx, this.apiID, this.apiKey, new NonceGeneratorMutex());
			this.ci.logger = this.log;
		},
		async loadMGIfExists() {
			const decCtx = await loadDecryptionContextFromIndexedDB();
			if(!decCtx) return;
			this.pointsComputed = DEFAULT_MMAX;
			await this.createCI(decCtx);
		},
		async generateMG() {
			this.log('Generating mG..');
			const decCtx = await createDecryptionContext({ cb: (pointsComputed: number) => {
				this.pointsComputed = pointsComputed;
				const progress = 100 * pointsComputed / DEFAULT_MMAX;
				this.log(`Generated ${pointsComputed.toLocaleString()} of ${DEFAULT_MMAX.toLocaleString()} points (${progress.toFixed(2)}%)..`);
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
			this.$bvModal.show('modal-loading');
			try {
				const begin = time();
				this.utxoLocation =
					(this.utxoLocationFound =
						await this.ci.findUTXOLocation(this.coin, this.addrType, this.addrBuf)).toString();
				this.findUTXOLocationTime = time() - begin;
			} catch(e) {
				this.log(e.stack);
				alert(e.toString());
			}
			this.$bvModal.hide('modal-loading');
		},
		async getUTXORangeAt() {
			if(!this.ci) {
				alert('Please generate mG first.');
				return;
			}
			this.$bvModal.show('modal-loading');
			try {
				const begin = time();
				this.utxoRangeFound = await this.ci.getUTXORangeAt(this.coin, this.addrType, parseInt(this.utxoLocation));
				this.utxoRange.begin = this.utxoRangeFound.begin.toString();
				this.utxoRange.count = this.utxoRangeFound.count.toString();
				this.getUTXORangeAtTime = time() - begin;
			} catch(e) {
				this.log(e.stack);
				alert(e.toString());
			}
			this.$bvModal.hide('modal-loading');
		},
		async getUTXOsInRange() {
			if(!this.ci) {
				alert('Please generate mG first.');
				return;
			}
			this.$bvModal.show('modal-loading');
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
				this.log(e.stack);
				alert(e.toString());
			}
			this.$bvModal.hide('modal-loading');
		},
	},
})
</script>

