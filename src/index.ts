import * as Tone from 'tone';

type EventName = 'on:audio:state:change' | 'on:change' | 'on:character:end' | 'on:word:end';
type Events = {
    [property in EventName]: Function;
};
type AudioState =
    | 'not-listening'
    | 'listening:no-sound'
    | 'listening:sound'
    | 'dot:length'
    | 'dash:length'
    | 'character:delimiter:length'
    | 'word:delimiter:length';
type ListeningState = 'no-sound' | 'sound';

export default class MicToMorseCode {
    private listenInterval: NodeJS.Timeout | null = null;
    private microphoneSource: Tone.UserMedia | null = null;
    private currentAudioState: AudioState = 'not-listening';
    private lastState: ListeningState = 'no-sound';
    private events: Events = {
        'on:change': () => {},
        'on:audio:state:change': () => {},
        'on:character:end': () => {},
        'on:word:end': () => {},
    };
    private soundStartTime: number = 0;
    private soundStopTime: number = 0;
    private morseSentence: string = '';
    private characterDelimiter: string = ' ';
    private wordDelimiter: string = '/';

    private threshold: number;
    private audioTimeResolution: number;
    private dotTime: number;
    private dashTime: number;
    private characterTime: number;
    private wordTime: number;
    private debounceTime: number;

    constructor(
        threshold: number = -50,
        audioTimeResolution: number = 50,
        dotTime: number = 0.5,
        dashTime: number = dotTime * 3,
        characterTime: number = dotTime * 4,
        wordTime: number = dotTime * 6,
        debounceTime: number = dotTime / 2,
    ) {
        this.threshold = threshold;
        this.audioTimeResolution = audioTimeResolution;
        this.dotTime = dotTime;
        this.dashTime = dashTime;
        this.characterTime = characterTime;
        this.wordTime = wordTime;
        this.debounceTime = debounceTime;
    }

    public setThreshold(threshold: number) {
        this.threshold = threshold;
    }

    public setDotTime(dotTime: number) {
        this.dotTime = dotTime;
    }

    public setDashTime(dashTime: number) {
        this.dashTime = dashTime;
    }

    public setCharacterTime(characterTime: number) {
        this.characterTime = characterTime;
    }

    public setWordTime(wordTime: number) {
        this.wordTime = wordTime;
    }

    public setDebounceTime(debounceTime: number) {
        this.debounceTime = debounceTime;
    }

    public setAudioTimeResolution(audioTimeResolution: number) {
        this.audioTimeResolution = audioTimeResolution;
    }

    public clearSentence() {
        const previous = this.morseSentence;
        this.morseSentence = '';
        this.emitSentenceChangeEvent(this.morseSentence, previous);
    }

    public deleteCharacter() {
        const previous = this.morseSentence;
        this.morseSentence.split(this.characterDelimiter).pop();
        this.emitSentenceChangeEvent(this.morseSentence, previous);
    }

    public deleteWord() {
        const previous = this.morseSentence;
        this.morseSentence.split(this.wordDelimiter).pop();
        this.emitSentenceChangeEvent(this.morseSentence, previous);
    }

    private emitSentenceChangeEvent(current: string, previous: string) {
        this.events['on:change'](current, previous);
    }

    private emitAudioStateChangeEvent(current: string, previous: string) {
        this.events['on:audio:state:change'](current, previous);
    }

    private emitCharacterEndEvent() {
        const characters = this.morseSentence.split(this.characterDelimiter);
        if (!characters) {
            return;
        }
        this.events['on:character:end'](characters[characters.length - 1]);
    }

    private emitWordEndEvent() {
        const word = this.morseSentence.split(this.wordDelimiter);
        if (!word) {
            return;
        }
        this.events['on:word:end'](word[word.length - 1]);
    }

    public getMorseString() {
        return this.morseSentence;
    }

    public createListener(eventName: EventName, onEventCallback: Function) {
        this.events[eventName] = onEventCallback;
    }

    public stopMicrophone() {
        if (this.listenInterval) {
            clearInterval(this.listenInterval);
        }
        if (this.microphoneSource) {
            this.microphoneSource.close();
        }
        this.changeAudioState('not-listening');
    }

    public startMicrophone() {
        if (Tone.Transport.state !== 'started') {
            Tone.start();
        }

        const meter = new Tone.Meter();
        this.microphoneSource = new Tone.UserMedia().connect(meter);
        this.microphoneSource
            .open()
            .then(() => {
                this.changeAudioState('listening:no-sound');
                this.listenInterval = setInterval(this.onMicTime(meter), this.audioTimeResolution);
            })
            .catch((e) => {
                console.log(e);
            });
    }

    private changeAudioState(state: AudioState) {
        const previous = this.currentAudioState;
        if (previous === state) {
            return;
        }
        this.currentAudioState = state;
        this.emitAudioStateChangeEvent(state, previous);
    }

    private onMicTime(meter: Tone.Meter) {
        return () => {
            const currentTime = meter.now();
            if (meter.getValue() > this.threshold) {
                this.logStartTime(currentTime);
                return;
            }
            this.logEndTime(currentTime);
        };
    }

    private logStartTime(currentTime: number) {
        if (currentTime - this.soundStopTime < this.debounceTime) {
            return;
        }
        if (this.wasSound()) {
            const onTime = currentTime - this.soundStartTime;
            if (onTime > this.dashTime) {
                this.changeAudioState('dash:length');
                return;
            }
            if (onTime > this.dotTime) {
                this.changeAudioState('dot:length');
                return;
            }
            return;
        }
        this.changeAudioState('listening:sound');
        this.lastState = 'sound';
        this.soundStartTime = currentTime;
    }

    private wasSound() {
        return this.lastState === 'sound';
    }

    private logEndTime(currentTime: number) {
        if (currentTime - this.soundStartTime < this.debounceTime) {
            return;
        }
        const offTime = currentTime - this.soundStopTime;
        const lastCharacter = this.morseSentence[this.morseSentence.length - 1];
        if (this.wasNoSound() && offTime > this.wordTime) {
            this.changeAudioState('word:delimiter:length');
            if (this.morseSentence.length === 0) {
                return;
            }
            if (lastCharacter === this.wordDelimiter) {
                return;
            }
            if (lastCharacter === this.characterDelimiter) {
                this.removeLastLetterFromMorse();
            }
            this.addCharacter(this.wordDelimiter);
            return;
        }
        if (this.wasNoSound() && offTime > this.characterTime) {
            this.changeAudioState('character:delimiter:length');
            if (this.morseSentence.length === 0) {
                return;
            }
            if (this.isDelimiter(lastCharacter)) {
                return;
            }
            this.addCharacter(this.characterDelimiter);
            return;
        }
        if (this.wasNoSound()) {
            this.changeAudioState('listening:no-sound');
            return;
        }

        if (this.wasSound()) {
            this.soundStopTime = currentTime;
            this.lastState = 'no-sound';
            const onTime = currentTime - this.soundStartTime;
            if (onTime > this.dashTime) {
                this.addCharacter('-');
                return;
            }
            if (onTime > this.dotTime) {
                this.addCharacter('.');
                return;
            }
        }
    }

    private wasNoSound() {
        return this.lastState === 'no-sound';
    }

    private removeLastLetterFromMorse() {
        this.morseSentence = this.morseSentence.replace(/.$/, '');
    }

    private isDelimiter(character: string) {
        return character === this.wordDelimiter || character === this.characterDelimiter;
    }

    private addCharacter(character: string) {
        const previous = this.morseSentence;
        this.morseSentence = this.morseSentence + character;
        if (character === this.wordDelimiter) {
            this.emitWordEndEvent();
        }
        if (character === this.characterDelimiter) {
            this.emitCharacterEndEvent();
        }
        this.emitSentenceChangeEvent(this.morseSentence, previous);
    }
}
