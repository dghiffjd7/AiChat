import { PersonaStore } from './persona-store.js';

const USER_STORAGE_KEY = 'chat_user_profiles_v1';
const USER_ACTIVE_KEY = 'chat_user_profiles_active_id_v1';

export class UserStore extends PersonaStore {
    constructor() {
        super({
            storageKey: USER_STORAGE_KEY,
            activeKey: USER_ACTIVE_KEY,
            idPrefix: 'user',
            defaultId: 'default',
            defaultName: '我',
            enableCardOffload: false,
        });
    }
}
