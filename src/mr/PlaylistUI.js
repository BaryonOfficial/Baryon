import { list } from 'postcss';
import * as THREE from 'three'
import ThreeMeshUI from 'three-mesh-ui'

const selectedAttributes = {
    offset: 0.002,
    backgroundOpacity: 0.7,
    backgroundColor: new THREE.Color( 0x777777 ),
    fontColor: new THREE.Color( 0x222222 )
};

const hoveredStateAttributes = {
    state: 'hovered',
    attributes: {
        offset: 0.002,
        backgroundColor: new THREE.Color( 0x999999 ),
        backgroundOpacity: 0.3,
        fontColor: new THREE.Color( 0xffffff )
    },
};

const idleStateAttributes = {
    state: 'idle',
    attributes: {
        offset: 0.002,
        backgroundColor: new THREE.Color( 0x666666 ),
        backgroundOpacity: 0.5,
        fontColor: new THREE.Color( 0xffffff )
    },
};

class PlaylistUI extends THREE.Object3D {
    constructor(listener, playlist) {
        super(); 
        this.listener = listener;
        this.playlist = playlist;
        this.objsToTest = []; 
        this.activeSong = null; 
        this.audioLoader = new THREE.AudioLoader();
        this.audio = new THREE.Audio(this.listener);

        this.init();
    }

    init() {

        // Make the body of the playlist 
        const body = new ThreeMeshUI.Block({
            padding: 0.05,
            backgroundOpacity: 0.5,
            alignItems: 'start',
            fontFamily: 'https://unpkg.com/three-mesh-ui/examples/assets/Roboto-msdf.json',
            fontTexture: 'https://unpkg.com/three-mesh-ui/examples/assets/Roboto-msdf.png'
        });

        body.position.set(0, 1.5, -1.0);
        body.rotation.x = -0.3;

        body.setupState( {
            state: 'selected',
            attributes: selectedAttributes,
            onSet: () => {
                console.log("selected body"); 
            }
        } );

        body.setupState( hoveredStateAttributes );
        body.setupState( idleStateAttributes );

        //this.objsToTest.push(body.children[0])
        // Add the title  
        const title = new ThreeMeshUI.Block({
            height: 0.5,
            width: 0.5,
            margin: 0.025,
            // padding: 0.025,
            justifyContent: 'center',
            textAlign: 'center',
            fontSize: 0.09,
        });

        title.add(
            new ThreeMeshUI.Text({
                content: this.playlist.title + "\n",
                fontSize: 0.125
            }),
            new ThreeMeshUI.Text({
                content: this.playlist.owner + "\n",
                fontSize: 0.075
            }),
            new ThreeMeshUI.Text({
                content: "-" + this.playlist.songs.length + " songs",
                fontSize: 0.075
            })
        );

        body.add(title);
        this.add(body);
        console.log("body", body);

        let songs = this.playlist.songs;
        
        // create an audio loader
        const audioLoader = new THREE.AudioLoader();

        for (let i = 0; i < songs.length; i++) {
            const card = new ThreeMeshUI.Block({
                height: 0.325,
                width: 1,
                margin: 0.025,
                justifyContent: 'start',
                contentDirection: "row",
                fontSize: 0.09,
            })

            const leftSubBlock = new ThreeMeshUI.Block({
                height: 0.325,
                width: 0.325,
                textAlign: "left",
                justifyContent: "end",
            });        

            const rightSubBlock = new ThreeMeshUI.Block({
                width: .70,
                height: 0.325,
                padding: 0.025,
                justifyContent: "center",
                textAlign: "left"
            });

            rightSubBlock.add(
                new ThreeMeshUI.Text({
                    content: songs[i].name + "\n",
                    fontSize: 0.075,
                }),
                new ThreeMeshUI.Text({
                    content: songs[i].by,
                    fontSize: 0.05
                })
            )

            rightSubBlock.setupState( {
                state: 'selected',
                attributes: selectedAttributes,
                onSet: () => {
                    this.playSong(songs[i])
                }
            } );

            rightSubBlock.setupState( hoveredStateAttributes );
            rightSubBlock.setupState( idleStateAttributes );
            this.objsToTest.push(rightSubBlock); 

            card.add(leftSubBlock, rightSubBlock);
            body.add(card);

            new THREE.TextureLoader().load(songs[i].image, (texture) => {
                leftSubBlock.set({
                    backgroundTexture: texture,
                })
            })
        }   

        this.objsToTest.push(body);

    }

    playSong(song) {
        console.log("song picked: ", song);
        this.audioLoader.load(song.audio, (buffer) => {
            if (this.audio.isPlaying) {
                this.audio.stop();
            }
            this.audio.setBuffer(buffer);
            this.audio.setLoop(true);
            this.audio.setVolume(0.5);
            this.audio.play();
            this.activeSong = song; // Update the currently active song
            console.log("Playing song: ", song.name);
        });
    }

    getSongPlaying() {
        return this.activeSong; 
    }

    getAudio() {
        return this.audio; 
    }

    update() {
        // if (!this.body.position.equals(this.position)) {
        //     this.body.
        // }
    }
}

export default PlaylistUI; 
