const { Telegraf, Context, session } = require('telegraf');
var axios = require('axios');
require('dotenv').config()


const TOKEN = process.env.BOT_TOKEN;
const TELEGRAM_URI = `https://api.telegram.org/bot${TOKEN}/sendMessage`
const chatIdMap = {
    "434414904": "434414904"
};
const ADMIN_CHAT_ID = "434414904";

let TIMEOUT_ID = null;
let COUNT = 0;

class TelegramBotHandler {
    constructor() {
        this.bot = new Telegraf(TOKEN, { telegram: { webhookReply: true } });;
        this.init();
        this.setupIntervalJob();
        this.informAdmin("init");

        return this.bot;
    }

    async informAdmin(message) {
      await axios.post(TELEGRAM_URI, {
            chat_id: ADMIN_CHAT_ID,
            text: message
        });
    }

    init() {
        this.bot.use(session());

        this.bot.command('/start', async (ctx) => {
            return ctx.reply('Start..');
        });

        this.bot.command('/sub', async (ctx) => {
            let chat_id = ctx.message.from.id;
            chatIdMap[chat_id] = chat_id;

            return ctx.reply(JSON.stringify(chatIdMap));
        });

        this.bot.command('/unsub', async (ctx) => {
            let chat_id = ctx.message.from.id;
            delete chatIdMap[chat_id];

            return ctx.reply(JSON.stringify(chatIdMap));
        });

        this.bot.command('/stop', async (ctx) => {
            clearTimeout(TIMEOUT_ID);
            TIMEOUT_ID = null;
            COUNT = 0;

            return ctx.reply("stopped")
        });

        this.bot.command('/restart', async (ctx) => {
            clearTimeout(TIMEOUT_ID);
            TIMEOUT_ID = null;

            this.setupIntervalJob();
            ctx.reply("restarted")
        });

        this.bot.command('/info', async (ctx) => {
            console.log("chatIdMap", chatIdMap);
            ctx.reply(`count = ${COUNT}`);
            ctx.reply(JSON.stringify(chatIdMap));
        });

        this.bot.on('message', async (ctx) => {
            let text = ctx.message.text;

            if (text.startsWith("add")) {
                const id = text.split(" ")[1];
                chatIdMap[id] = id;

                return ctx.reply(JSON.stringify(chatIdMap));
            }

            ctx.reply('Ok');
        });

        this.bot.catch((err, ctx) => {
            return ctx.reply(`Ooops, bot encountered an error for ${ctx.updateType}`, err)
        });

        this.bot.launch();
    }

    setupIntervalJob() {
        const run = async () => {
            try {
                await this.handleTrips();
            } catch (err) {
                this.informAdmin(err);
            } finally {
                TIMEOUT_ID = setTimeout(run, this.getJobInterval());
            }
        };

        clearTimeout(TIMEOUT_ID);
        TIMEOUT_ID = setTimeout(run, this.getJobInterval());
    }

    getJobInterval() {
        return 1 * 60 * 1000;
    }

    async sendMessageToAllUsers(message) {
        const chatIds = Object.keys(chatIdMap);

        for (const chatId of chatIds) {
            await axios.post(TELEGRAM_URI, {
                chat_id: chatId,
                text: message
            });
        }
    }

    async handleTrips() {
        try {
            COUNT++;
            await this.informAdmin(`started ${COUNT}`);
            const allAvailableTrips = [];

            const availableTrips = await Promise.all([
                this.findSuitableTripsByDate('2025-12-30', '01')
            ]);
            availableTrips.forEach((trips) => allAvailableTrips.push(...trips));

            if (!allAvailableTrips.length) {
                await this.informAdmin("empty result");
                return;
            }
            const message = this.formatTripsDisplayMessage(allAvailableTrips);

            await this.sendMessageToAllUsers(message);
            await this.informAdmin(`finished ${COUNT}`);
        } catch (err) {
            this.informAdmin("errrrrr222")
        }
    }

    async findSuitableTripsByDate(date, time) {
        const trips = await this.loadTrips(date);
        return Object.values(trips)
            .filter(trip => {
                // const depTime = +trip.departure_time.split(":")[0];
                // return trip.free_seats > 0 && depTime >= time && trip.active;
                const routeDate = trip.datetime.split("T")[0];
                return routeDate === date && trip.free_seats > 0 && trip.active;
            });
    }

    async loadTrips(date, cityNumber = 1) {
        const apiUrl = 'https://mogilevminsk.by/timetable/trips/';

        const formData = new FormData();
        formData.append('date', date);
        formData.append('from_city', cityNumber);

        // Axios POST request with form data
        const {data: {data: {trips}}} = await axios.post(apiUrl, formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
        return trips;
    }

    formatTripsDisplayMessage(trips) {
        return trips.reduce((acc, trip, number) => {
            return acc + `${number + 1}) ${trip.route}; ${trip.date}; ${trip.departure_time}; свободно: ${trip.free_seats}; ${trip.price} ${trip.currency}\n`
        }, ``);

    }
}

new TelegramBotHandler();
console.log("Telegram bot initialized.");
