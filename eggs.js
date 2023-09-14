import { promises as fs } from 'fs';
import { odata, TableClient, AzureNamedKeyCredential } from "@azure/data-tables";
import { v4 as uuidv4 } from 'uuid';

const account = JSON.parse(await fs.readFile('./secret.json', 'utf-8')).tableAccount;
const accountKey = JSON.parse(await fs.readFile('./secret.json', 'utf-8')).tableAccountKey;

const azureTableEndpoint = "https://" + account + ".table.core.windows.net/";
const azureTableCredential = new AzureNamedKeyCredential(account, accountKey);
const eggTableName = "eggs";
export const eggTableClient = new TableClient(azureTableEndpoint, eggTableName, azureTableCredential);
const partitionKey = "egg";

export let eggsRowCount = parseInt(await getRowCount(eggTableClient), 10)

console.log(`setting number of rows for eggs db to ${eggsRowCount}`)

async function getRowCount(tableClient) {
  let rowList = []
  let entities = await tableClient.listEntities();
  for await (const entity of entities) {
    rowList.push(entity.RowKey)
  }
  return rowList.length
}

export async function dbCheckUserExists(userName) {
  let entities = eggTableClient.listEntities({
    queryOptions: { filter: odata`userNameSanitised eq ${userName.toLowerCase()}` }
  });

  for await (const entity of entities) {
    console.log(`${entity.rowKey}`);
    return entity.rowKey;
  }
}

export async function dbGetEggs(userId) {
  let entity = await eggTableClient.getEntity("egg", userId);
  let userData = {
    userName: entity.userName,
    eggsAmount: entity.eggsAmount
  };
  // return object of username and eggs amount
  return userData;
}

export async function dbAddEggUser(userName, eggAmount) {
  const uuid = uuidv4();
  const userNameSanitised = `${userName.toLowerCase()}`
  console.log(`adding row ${uuid} and userName/eggsAmount/userNameSanitised: ${userName}/${eggAmount}/${userNameSanitised}`)
  const entity = {
    partitionKey: partitionKey,
    rowKey: uuid,
    userName: userName,
    eggsAmount: eggAmount,
    userNameSanitised: userNameSanitised
  };
  try {
    await eggTableClient.createEntity(entity);
  } catch (e) {
    console.log("Failed to add user", e)
  }
}

export async function dbGetAllEggs() {
  let eggMap = [];
  let eggObject = {};
  let entities = eggTableClient.listEntities();
  for await (const entity of entities) {
    eggObject = { ID: entity.rowKey, Name: entity.userName, Eggs: entity.eggsAmount, NameLower: entity.userNameSanitised };
    eggMap.push(eggObject);
  }
  return eggMap;
}

export async function dbUpdateEggs(id, eggsAmount) {
  const entity = {
    partitionKey: partitionKey,
    rowKey: id,
    eggsAmount: eggsAmount,
  };
  eggTableClient.updateEntity(entity)
}
