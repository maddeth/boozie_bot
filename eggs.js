import { promises as fs } from 'fs';
import { odata, TableClient, AzureNamedKeyCredential } from "@azure/data-tables";

const account = JSON.parse(await fs.readFile('./secret.json', 'utf-8')).tableAccount;
const accountKey = JSON.parse(await fs.readFile('./secret.json', 'utf-8')).tableAccountKey;

const azureTableEndpoint = "https://" + account + ".table.core.windows.net/";
const azureTableCredential = new AzureNamedKeyCredential(account, accountKey);
const eggTableName = "eggs";
export const eggTableClient = new TableClient(azureTableEndpoint, eggTableName, azureTableCredential);
const partitionKey = "egg";

export let eggsRowCount = parseInt(await getRowCount(eggTableClient), 10)

console.log(`setting number of rows for eggs db to ${eggsRowCount}`)

// export async function eggsRowCount() {
//   let rowNumbers = parseInt(await getRowCount(eggTableClient), 10)
//   return rowNumbers
// }

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
  const userNameSanitised = `${userName.toLowerCase()}`
  let row = eggsRowCount + 1
  console.log(`adding row ${row} and userName/eggsAmount/userNameSanitised: ${userName}/${eggAmount}/${userNameSanitised}`)
  const entity = {
    partitionKey: partitionKey,
    rowKey: `${row}`,
    userName: userName,
    eggsAmount: eggAmount,
    userNameSanitised: userNameSanitised
  };
  await eggTableClient.createEntity(entity);
  eggsRowCount = parseInt(await getRowCount(eggTableClient), 10)
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
