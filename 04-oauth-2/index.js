const fs = require("fs");
const url = require("url");
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const querystring = require("querystring");

const {client_id, client_secret, scope} = require("./auth/credentials.json");

const host = "localhost" // Side note localhost can also be accessed using IPv6 with [::1]:3000
const port = 3000;

const task_states = [];
const server = http.createServer();

server.on("listening", listen_handler);
server.listen(port);
function listen_handler(){
	console.log(`Now Listening on Port ${port}`);
	console.log(server.address());
}

server.on("request", request_handler);
function request_handler(req, res){
    console.log(`New Request from ${req.socket.remoteAddress} for ${req.url}`);
    if(req.url === "/"){
        const form = fs.createReadStream("html/index.html");
		res.writeHead(200, {"Content-Type": "text/html"})
		form.pipe(res);
    }
    else if (req.url.startsWith("/add_task")){
		let user_input = url.parse(req.url, true).query;
		if(user_input === null){
			not_found(res);
		}
		const {task} = user_input;
		const state = crypto.randomBytes(20).toString("hex");
		task_states.push({task, state});
		redirect_to_todoist(state, res);
	}
	else if(req.url.startsWith("/receive_code")){
		const {code, state} = url.parse(req.url, true).query;
		console.log(code);
		let task_state = task_states.find(task_state => task_state.state === state);
        if(code === undefined || state === undefined || task_state === undefined){
			not_found(res);
			return;
		}
		const {task} = task_state;
		send_access_token_request(code, task, res);
	}
    else{
		not_found(res);
    }
}

function not_found(res){
	res.writeHead(404, {"Content-Type": "text/html"});
	res.end(`<h1>404 Not Found</h1>`);
}

function redirect_to_todoist(state, res){
	const authorization_endpoint = "https://todoist.com/oauth/authorize";
	console.log({client_id, scope, state});
    let uri = querystring.stringify({client_id, scope, state});
	res.writeHead(302, {Location: `${authorization_endpoint}?${uri}`})
	   .end();
}

function send_access_token_request(code, task, res){
	const token_endpoint = "https://todoist.com/oauth/access_token";
	const post_data = querystring.stringify({client_id, client_secret, code});
	console.log(post_data);
	let options = {
		method: "POST",
		headers:{
			"Content-Type":"application/x-www-form-urlencoded"
		}
	}
	https.request(
		token_endpoint, 
		options, 
		(token_stream) => process_stream(token_stream, receive_access_token, task, res)
	).end(post_data);
}

function process_stream (stream, callback , ...args){
	let body = "";
	stream.on("data", chunk => body += chunk);
	stream.on("end", () => callback(body, ...args));
}

function receive_access_token(body, task, res){
	const {access_token} = JSON.parse(body);
	send_add_task_request(task, access_token, res);
}

function send_add_task_request(task, access_token, res){
	const task_endpoint = "https://api.todoist.com/rest/v2/tasks";
	const post_data = JSON.stringify({"content":task});
	const options = {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${access_token}`
		}
	}
	https.request(
		task_endpoint, 
		options, 
		(task_stream) => process_stream(task_stream, receive_task_response, res)
	).end(post_data);
}

function receive_task_response(body, res){
	const results = JSON.parse(body);
	console.log(results);
	res.writeHead(302, {Location: `${results.url}`})
	   .end();
}
