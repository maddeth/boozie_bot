import { promises as fs } from 'fs';
import { odata, TableClient, AzureNamedKeyCredential } from "@azure/data-tables";
import { v4 as uuidv4 } from 'uuid';
import logger from '../../utils/logger.js';

const account = JSON.parse(await fs.readFile('./secret.json', 'utf-8')).tableAccount;
const accountKey = JSON.parse(await fs.readFile('./secret.json', 'utf-8')).tableAccountKey;

const azureTableEndpoint = "https://" + account + ".table.core.windows.net/";
const azureTableCredential = new AzureNamedKeyCredential(account, accountKey);
const eggTableName = "eggs";
export const eggTableClient = new TableClient(azureTableEndpoint, eggTableName, azureTableCredential);
const partitionKey = "egg";

export let eggsRowCount = parseInt(await getRowCount(eggTableClient), 10)

logger.info('Eggs database initialized', { rowCount: eggsRowCount })

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
    logger.debug('Found existing egg user', { username: userName, rowKey: entity.rowKey });
    return entity.rowKey;
  }
}

export async function dbGetEggs(userName) {
  let entities = eggTableClient.listEntities({
    queryOptions: { filter: odata`userNameSanitised eq ${userName.toLowerCase()}` }
  });
  for await (const entity of entities) {
    let userData = {
      userName: entity.userName,
      eggsAmount: entity.eggsAmount,
      userId: entity.rowKey
    };
    return userData;
  }
}

export async function dbAddEggUser(userName, eggAmount) {
  const uuid = uuidv4();
  const userNameSanitised = `${userName.toLowerCase()}`
  logger.info('Creating new egg user', { uuid, userName, eggAmount, userNameSanitised })
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
    logger.error("Failed to add egg user", { userName, eggAmount, error: e })
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
