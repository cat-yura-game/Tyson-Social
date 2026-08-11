import sodium from 'libsodium-wrappers';

export interface DeviceIdentity {
  deviceId: string;
  publicKey: string;
  privateKey: string;
}

const DB_NAME = 'tyson-e2ee';
const STORE_NAME = 'device-identities';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readIdentity(userId: string): Promise<DeviceIdentity | null> {
  const database = await openDatabase();
  return new Promise<DeviceIdentity | null>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(userId);
    request.onsuccess = () => resolve((request.result as DeviceIdentity | undefined) ?? null);
    request.onerror = () => reject(request.error);
  }).finally(() => database.close());
}

async function writeIdentity(userId: string, identity: DeviceIdentity): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(identity, userId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  }).finally(() => database.close());
}

export async function getOrCreateIdentity(userId: string): Promise<DeviceIdentity> {
  await sodium.ready;
  const stored = await readIdentity(userId);
  if (stored) return stored;
  const pair = sodium.crypto_box_keypair();
  const identity = {
    deviceId: crypto.randomUUID(),
    publicKey: sodium.to_base64(pair.publicKey, sodium.base64_variants.ORIGINAL),
    privateKey: sodium.to_base64(pair.privateKey, sodium.base64_variants.ORIGINAL),
  };
  await writeIdentity(userId, identity);
  return identity;
}

export async function encryptForDevice(plaintext: string, publicKey: string): Promise<string> {
  await sodium.ready;
  const ciphertext = sodium.crypto_box_seal(
    sodium.from_string(plaintext),
    sodium.from_base64(publicKey, sodium.base64_variants.ORIGINAL),
  );
  return sodium.to_base64(ciphertext, sodium.base64_variants.ORIGINAL);
}

export async function decryptForDevice(ciphertext: string, identity: DeviceIdentity): Promise<string> {
  await sodium.ready;
  const plaintext = sodium.crypto_box_seal_open(
    sodium.from_base64(ciphertext, sodium.base64_variants.ORIGINAL),
    sodium.from_base64(identity.publicKey, sodium.base64_variants.ORIGINAL),
    sodium.from_base64(identity.privateKey, sodium.base64_variants.ORIGINAL),
  );
  if (!plaintext) throw new Error('Unable to decrypt this message on the current device.');
  return sodium.to_string(plaintext);
}
