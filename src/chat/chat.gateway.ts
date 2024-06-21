import {
  SubscribeMessage,
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
import { Socket, Server } from 'socket.io';
import { Inject, OnModuleInit } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

@WebSocketGateway({ cors: true })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer() server: Server;
  private users: { [key: string]: string } = {};

  constructor(
    @Inject('REDIS_SERVICE') private readonly client: ClientProxy
  ) {}

  async onModuleInit() {
    await this.client.connect();
  }

  async handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    const username = this.users[client.id];
    if (username) {
      await this.client.send({ cmd: 'set_user' }, { username, clientId: null }).toPromise();
    }
    delete this.users[client.id];
  }

  @SubscribeMessage('set_user')
  async handleSetUser(client: Socket, payload: { user: string }) {
    this.users[client.id] = payload.user;
    await this.client.send({ cmd: 'set_user' }, { username: payload.user, clientId: client.id }).toPromise();
  }

  @SubscribeMessage('join')
  handleJoinRoom(client: Socket, payload: { room: string; user: string }) {
    client.join(payload.room);
    this.users[client.id] = payload.user;
    this.server.to(payload.room).emit('message', {
      user: 'system',
      text: `${payload.user} has joined the room ${payload.room}`,
    });
  }

  @SubscribeMessage('leave')
  handleLeaveRoom(client: Socket, payload: { room: string }) {
    client.leave(payload.room);
    const user = this.users[client.id];
    this.server.to(payload.room).emit('message', {
      user: 'system',
      text: `${user} has left the room ${payload.room}`,
    });
  }

  @SubscribeMessage('message')
  handleMessage(client: Socket, payload: { room: string; message: string }) {
    const user = this.users[client.id];
    this.server.to(payload.room).emit('message', {
      user: user,
      text: payload.message,
    });
  }

  @SubscribeMessage('private_message')
  async handlePrivateMessage(client: Socket, payload: { to: string; message: string }) {
    const user = this.users[client.id];
    const targetClientId = await this.getClientIdByUser(payload.to);

    if (targetClientId) {
      this.server.to(targetClientId).emit('private_message', {
        user: user,
        text: payload.message,
      });
    } else {
      client.emit('private_message_error', {
        message: `User ${payload.to} is not connected.`,
      });
    }
  }

  async getClientIdByUser(username: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      this.client.send({ cmd: 'get_user' }, username).subscribe(
        (clientId) => resolve(clientId),
        (err) => reject(err)
      );
    });
  }
}
