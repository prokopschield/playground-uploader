const fs = require('fs');
const {
	execSync
} = require('child_process');

fs.writeFileSync('module_installer.js', `{
	try {
		require('beautify');
		require('blakejs');
		require('socket.io-client');
		require('hound');
	} catch(e) {
		require('child_process').execSync('npm i beautify blakejs socket.io-client hound');
	}
}`);

execSync('node module_installer.js');

const blake = require('blakejs').blake2sHex;
const beautify = require('beautify');

const fn = __filename;
const pathslash = (process.platform === 'win32') ? '\\' : '/';

process.stdout.write('\r\n\x1b[40m\x1b[92m\r\n');

const readline = require('readline');
const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
	terminal: false,
});

async function ask(question) {
	process.stdout.write(`\r\n${question} :: `);
	return new Promise(accept => rl.once('line', accept));
}

function askTOS(callback) {
	console.log(`
		Terms of use:
		
		Posting material, which has been copyrighted
		by some other person, is forbidden.
		
		Posting your own, original material to this website
		explicitly allows us to use any such material.
		
		Any material which is copyrighted must explicitly state
		it is copyrighted, and by whom.
		
		By uploading something to our server, you thereby grant
		free license to all users and operators of this server.
		
		You shall, and by uploading do, give and guarantee
		an unlimited licence to all uploaded content.
		
		You shall hold us not liable for anything you do.

		You shall not post anything you do not own.
		
		You shall not infringe copyright.
		
		You shall not do anything illegal.
		
		You shall not do anything immoral.

		Any and all disputes shall be handeled
		by an arbitor designated by us.
		
		Don't be evil.

	`);

	ask('Do you agree to these terms?')
		.then(answer => {
			if (answer.toLowerCase()[0] === 'y') {
				return process.nextTick(callback, answer);
			} else {
				return process.nextTick(askTOS, callback);
			}
		});
}

const io = require('socket.io-client')('wss://playground.schield.eu:40004');

var playground, password, token;

function send(o) {
	if (token && password) {
		o.token = token;
		o.signed = blake(token + blake(password));
	}
	io.emit('request', o);
	return new Promise(accept =>
		io.once('data', (res) => {
			if (res.token) token = res.token;
			if (res.error) console.log(res.error);
			if (res.message) console.log(res.message);
			accept(res);
		})
	);
}

const playgroundCredentials = (
	fs.existsSync('playground-credentials.json') ?
	require('./playground-credentials.json') : {}
);

function passwordStore(playground, password) {
	if (password && (playgroundCredentials[playground] !== password)) {
		playgroundCredentials[playground] = password;
		fs.writeFileSync(
			'playground-credentials.json',
			JSON.stringify(
				playgroundCredentials,
				null,
				'\t'
			)
		);
	}
	return playgroundCredentials[playground];
}

function promptUserLogin(callback) {
	ask('Playground')
		.then(p => p.toLowerCase().replace(/[^a-z]/, ''))
		.then(async (playgroundi) => {
			password = (
				passwordStore(playgroundi) ||
				await ask('Password').then(passwordi => blake(passwordi))
			);

			send({
					action: 'login',
					playground: playgroundi
				})
				.then(() => send({
					action: 'login',
					playground: playgroundi
				}))
				.then((o) => {
					if (o.login === 'success') {
						playground = playgroundi;
						passwordStore(playground, password);
						process.nextTick(callback, playground);
					} else {
						ask('Password').then(p => password = blake(p))
							.then(() => {
								send({
										action: 'login',
										playground: playgroundi
									})
									.then(() => send({
										action: 'login',
										playground: playgroundi
									}))
									.then((o) => {
										if (o.login === 'success') {
											playground = playgroundi;
											passwordStore(playground, password);
											process.nextTick(callback, playground);
										} else {
											console.log('Incorrect credentials!');
											process.nextTick(promptUserLogin, callback);
										}
									})
							})
					}
				})

		})
}

askTOS(() => promptUserLogin(async (playground) => {
	const path = require('path');
	const cwd = process.cwd();
	let consider = false;
	let explen = -1;

	function uploadConsider() {
		process.stdout.write('.');
		if (consider && (uploadqueue.length === explen) && uploadqueue.length) {
			consider = false;
			uploadTicker()
				.catch((...args) => ({
					error: args
				}))
				.then((...args) => (args.length ? console.log('\n', args) : ''))
				.finally(uploadConsider)
		} else {
			consider = true;
			explen = uploadqueue.length;
			setTimeout(uploadConsider, 2000);
		}
	}
	async function uploadTicker() {
		const file = uploadqueue.pop();
		const exists = fs.existsSync(file);
		if (exists) {
			const rel = path.relative(cwd, file);
			if (rel === 'playground-credentials.json') return 'Skipped credentials file.';
			if (rel === 'package-lock.json') return 'Skipped package-lock.json';
			if (rel.match(/^[a-z]+\.?[a-z]+$/)) {
				const ext = rel.split('.').pop();
				const data = await fs.promises.readFile(file);
				if (['css', 'js', 'json', 'html', 'xml'].includes(ext)) {
					var newdata = beautify('' + data, {
						format: ext
					}).replace(/ {4}/g, '\t');
					if (newdata != ('' + data)) {
						await fs.promises.writeFile(file, newdata);
					}
				}
				return await send({
						action: 'update_file',
						file: rel,
						type: ext,
						data: newdata || data
					})
					.then(r => (r.update === 'success'))
					.then(a => a && `Uploaded ${rel} successfully.`)
					.then(a => a || `Failed to upload ${rel}`)
			} else {
				let spl = rel.split('.');
				let ext = (((spl.length > 1) ? spl.pop() : 'bin').toLowerCase().replace(/[^a-z]/g, '')) || 'bin';
				let bse = spl.join('').toLowerCase().replace(/[^a-z]/g, '');
				let nwr = bse.length ? `${bse}.${ext}` : ext;
				let nwp = path.resolve(cwd, nwr);
				console.log({
					spl,
					ext,
					bse,
					nwr,
					nwp
				});
				if (fs.existsSync(nwp)) {
					return `Could not upload ${rel}: Unacceptable name.`;
				} else {
					fs.renameSync(file, nwp);
					return `Renamed ${rel} to ${nwr}.`;
				}
			}
		} else {
			return `File not found: ${file}`;
		}
	}
	const uploadqueue = [];

	function scandir(directory) {
		const dir = fs.readdirSync(directory);
		dir.forEach(file => {
			if (file === 'module_installer.js') return;
			if (file === 'node_modules') return;
			if (file === 'playground-credentials.json') return;
			if (file === 'package-lock.json') return;
			if (file[0] === '.') return;
			file = path.resolve(directory, file);
			if (fs.statSync(file).isDirectory()) {
				scandir(file);
			} else {
				uploadqueue.push(file);
			}
		});
	}
	process.nextTick(scandir, cwd);
	const hound = require('hound');
	const watcher = hound.watch(cwd);
	const queueFile = (file) => ((file.split('/').pop()[0] !== '.') && uploadqueue.push(file));
	watcher.on('create', queueFile);
	watcher.on('change', queueFile);
	watcher.on('delete', queueFile);
	process.nextTick(uploadConsider);
}));