
const express = require('express');
const bodyParser = require('body-parser');
const app = express();

const uuid = require('uuid/v4');

app.use(bodyParser.json());

const ONLY_VALID_TOKEN = 'MdKTi3fEg99ZeOsgRIaVJr8D9fZq0XNT';

app.post('/local-deepstream-auth', (req, res) => {
  const { authData } = req.body;

  const generatedId = uuid();

  if(authData && authData.token) {
    if (authData.token === ONLY_VALID_TOKEN) {
      res.json({
        username: generatedId,
        clientData: { id: generatedId },
        serverData: { hasAuthority: true }
      });

      return;
    }

    res.status(403).send('Invalid token');
    return;
  }

  res.json({
    username: generatedId,
    clientData: { id: generatedId },
    serverData: {}
  });
});

app.listen(3871, () => console.log('Local Deepstream Auth running on 3871.'));
