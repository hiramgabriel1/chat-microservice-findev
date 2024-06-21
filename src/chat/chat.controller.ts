import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { createClient, RedisClientType } from 'redis';

@Controller()
export class ChatController {
    private redisClient: RedisClientType;

    constructor() {
        this.redisClient = createClient({ url: 'redis://localhost:6377' });
        this.redisClient.connect();
    }

    @MessagePattern({ cmd: 'get_user' })
    async getUser(username: string): Promise<string | null> {
        return this.redisClient.get(username);
    }

    @MessagePattern({ cmd: 'set_user' })
    async setUser({
        username,
        clientId,
    }: {
        username: string;
        clientId: string | null;
    }) {
        if (clientId) await this.redisClient.set(username, clientId);

        await this.redisClient.del(username);
    }
}
