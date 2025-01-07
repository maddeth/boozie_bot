import swaggerAutogen from 'swagger-autogen';

const doc = {
  info: {
    title: 'BoozieBot API',
    description: 'API endpoint for BoozieBot'
  },
  host: 'maddeth.com'
};

const outputFile = './swagger-output.json';
const routes = ['./server.js'];

swaggerAutogen()(outputFile, routes, doc);