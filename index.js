'use strict'
const api = require('./api');
const cors = require('cors');

const corsHandler = cors({ origin: true });

exports.bl2sl = (req, res) => {
    console.log(JSON.stringify(req.body))
    corsHandler(req, res, () => {
        switch (req.method) {
            case 'POST':
                api.apiController(req, res);
                break;
            default:
                res.status(400).send('not allowed');
                break;
        }
    });
};
