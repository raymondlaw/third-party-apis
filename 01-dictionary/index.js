const fs = require('fs');
const http = require('http');
const https = require('https');

const port = 3000;

const server = http.createServer();
server.on("request", request_handler);
server.on("listening", listen_handler);
server.listen(port);

function listen_handler(){
	console.log(`Now Listening on Port ${port}`);
}
function request_handler(req, res){
    console.log(req.url);
    if(req.url === "/"){
        const form = fs.createReadStream("html/index.html");
		res.writeHead(200, {"Content-Type": "text/html"})
		form.pipe(res);
    }
    else if(req.url.startsWith("/search")){
        const user_input = new URL(req.url, `https://${req.headers.host}`).searchParams;
        console.log(user_input);
        const word = user_input.get('word');
        if(word == null || word == ""){
            res.writeHead(404, {"Content-Type": "text/html"});
            res.end("<h1>Missing Input</h1>");        
        }
        else{
            const dictionary_api = https.request(`https://api.dictionaryapi.dev/api/v2/entries/en_US/${word}`);
            dictionary_api.on("response" , dictionary_res => process_stream(dictionary_res, parse_results, res));
            dictionary_api.end();
        }
    }
    else{
        res.writeHead(404, {"Content-Type": "text/html"});
        res.end("<h1>Not Found</h1>");    
    }
}

function process_stream (stream, callback , ...args){
	let body = "";
	stream.on("data", chunk => body += chunk);
	stream.on("end", () => callback(body, ...args));
}

function parse_results(data, res){
    const lookup = JSON.parse(data);
	let results = "<h1>No Results Found</h1>";
    if(Array.isArray(lookup)){
        let firstDefinition = lookup[0]?.meanings[0]?.definitions[0]?.definition;
        results = `<h1>Results:${lookup[0]?.word}</h1><p>${firstDefinition}</p>`;
    }
    res.writeHead(200, {"Content-Type": "text/html"})
	res.end(results);
}
