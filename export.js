var Promise = require('bluebird');
var cassandra = require('cassandra-driver');
var fs = require('fs');
var jsonStream = require('JSONStream');

var systemClient;
var client;

async function exportFromDB({
    HOST = '127.0.0.1',
    PORT = 9042,
    KEYSPACE,
    USER,
    PASSWORD,
    DIRECTORY = './data',
    USE_SSL,
}) {

    if (!KEYSPACE) {
        console.log('`KEYSPACE` must be specified as environment variable');
        process.exit();
    }
    
    
    var authProvider;
    if (USER && PASSWORD) {
        authProvider = new cassandra.auth.PlainTextAuthProvider(USER, PASSWORD);
    }
    
    var sslOptions;
    if (USE_SSL) {
        sslOptions = { rejectUnauthorized: false };
    }
    
    systemClient = new cassandra.Client({contactPoints: [HOST], authProvider: authProvider, protocolOptions: {port: [PORT]}});
    client = new cassandra.Client({ contactPoints: [HOST], keyspace: KEYSPACE, authProvider: authProvider, protocolOptions: {port: [PORT]}});

    return systemClient.connect()
    .then(function (){
        var systemQuery = "SELECT columnfamily_name as table_name FROM system.schema_columnfamilies WHERE keyspace_name = ?";
        if (systemClient.metadata.keyspaces.system_schema) {
            systemQuery = "SELECT table_name FROM system_schema.tables WHERE keyspace_name = ?";
        }

        console.log('Finding tables in keyspace: ' + KEYSPACE);
        return systemClient.execute(systemQuery, [KEYSPACE]);
    })
    .then(function (result){
        var tables = [];
        for(var i = 0; i < result.rows.length; i++) {
            tables.push(result.rows[i].table_name);
        }

        if (process.env.TABLE) {
            return processTableExport(process.env.TABLE, DIRECTORY);
        }

        return Promise.each(tables, function(table){
            return processTableExport(table, DIRECTORY);
        });
    })
    .then(async function (){
        console.log('==================================================');
        console.log('Completed exporting all tables from keyspace: ' + KEYSPACE);
        var gracefulShutdown = [];
        gracefulShutdown.push(systemClient.shutdown());
        gracefulShutdown.push(client.shutdown());
        await Promise.all(gracefulShutdown)
            .catch(function (err){
                console.log(err);
                process.exit(1);
            });
    })
    .catch(function (err){
        console.log(err);
    });
} 

function processTableExport(table, DIRECTORY) {
    console.log('==================================================');
    console.log('Reading table: ' + table);
    return new Promise(function(resolve, reject) {
        var jsonfile = fs.createWriteStream(DIRECTORY +"/" + table + '.json');
        jsonfile.on('error', function (err) {
            reject(err);
        });

        var processed = 0;
        var startTime = Date.now();
        jsonfile.on('finish', function () {
            var timeTaken = (Date.now() - startTime) / 1000;
            var throughput = timeTaken ? processed / timeTaken : 0.00;
            console.log('Done with table, throughput: ' + throughput.toFixed(1) + ' rows/s');
            resolve();
        });
        var writeStream = jsonStream.stringify('[', ',', ']');
        writeStream.pipe(jsonfile);

        var query = 'SELECT * FROM "' + table + '"';
        var options = { prepare : true , fetchSize : 1000 };

        client.eachRow(query, [], options, function (n, row) {
            var rowObject = {};
            row.forEach(function (value, key) {
                if (typeof value === 'number') {
                    if (Number.isNaN(value)) {
                        rowObject[key] = {
                            type: "NOT_A_NUMBER"
                        }
                    } else if (Number.isFinite(value)) {
                        rowObject[key] = value;
                    } else if (value > 0) {
                        rowObject[key] = {
                            type: "POSITIVE_INFINITY"
                        }
                    } else {
                        rowObject[key] = {
                            type: "NEGATIVE_INFINITY"
                        }
                    }
                } else {
                    rowObject[key] = value;
                }
            });

            processed++;
            writeStream.write(rowObject);
        }, function (err, result) {

            if (err) {
                reject(err);
                return;
            }

            console.log('Streaming ' + processed + ' rows to: ' + table + '.json');

            if (result.nextPage) {
                result.nextPage();
                return;
            }

            console.log('Finalizing writes into: ' + table + '.json');
            writeStream.end();
        });
    });
}

module.exports = exportFromDB;