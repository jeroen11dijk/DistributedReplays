import * as React from "react"
import {
    AmbientLight,
    AxesHelper,
    DoubleSide,
    HemisphereLight,
    LoadingManager,
    Mesh,
    MeshPhongMaterial,
    Object3D,
    PerspectiveCamera,
    PlaneBufferGeometry,
    Scene,
    WebGLRenderer
} from "three"
import { Stats } from "../../../lib"
import { FPSClock } from "../../../Models"
import { isDevelopment } from "../../../Utils"
import { BALL_NAME, ThreeHelper } from "./ThreeHelper"
import { ThreeModelLoader } from "./ThreeLoader"
import { ThreePlayer } from "./ThreePlayer"

export interface Props {
    replayData: ReplayDataResponse
    clock: FPSClock
    activeCamera?: string
}

interface FieldScene {
    scene: Scene
    camera: PerspectiveCamera
    ball: Object3D
    ground: Object3D
    players: ThreePlayer[]
}

export class ThreeScene extends React.PureComponent<Props> {
    private readonly loadingManager: LoadingManager
    private readonly renderer: WebGLRenderer
    private mount: HTMLDivElement | null = null
    private stats: Stats | null = null
    private hasStarted: boolean
    private activePlayer: number
    private readonly helper: ThreeHelper
    private readonly threeField: FieldScene

    constructor(props: Props) {
        super(props)
        this.loadingManager = new LoadingManager()
        this.renderer = new WebGLRenderer({ antialias: true })
        this.helper = new ThreeHelper(props.replayData)
        this.threeField = {} as any
        this.addToWindow(this.threeField, "field")
        this.activePlayer = -1
        this.hasStarted = false
    }

    public componentDidMount() {
        this.loadingManager.onProgress = (item, loaded, total) => {
            // TODO: Show loader animation that prints what is getting loaded and progress
            // console.log(item, loaded, total)
        }

        // Generate the lighting
        this.generateScene()
        window.addEventListener("resize", this.updateSize)

        const asyncLoaders = Promise.all([
            this.generatePlayfield(),
            this.generateBall(),
            this.generatePlayers(this.props.replayData.names)
        ])
        asyncLoaders
            .then(this.start)
            .catch((e) => console.error(`There was an error generating Three objects: ${e}`))

        // Logs framerate
        if (isDevelopment()) {
            this.stats = new Stats()
            this.stats.showPanel(0)
            if (this.mount) {
                this.mount.appendChild(this.stats.dom)
            }
        }
    }

    public componentDidUpdate() {
        this.addToWindow(this.props.clock, "clock")
        this.setActivePlayer()
    }

    public componentWillUnmount() {
        this.stop()
        if (this.mount) {
            if (this.stats) {
                this.mount.removeChild(this.stats.dom)
            }
            this.mount.removeChild(this.renderer.domElement)
        }
        window.removeEventListener("resize", this.updateSize)
    }

    public render() {
        return (
            <div style={{ position: "relative" }}>
                <div
                    style={{ width: "100%", height: "600px", margin: "auto" }}
                    ref={(mount) => {
                        this.mount = mount
                    }}
                />
                <div style={{ position: "absolute", top: "0", left: "0", margin: ".5rem" }}>
                    <button onClick={() => this.setCameraView(0)}>Orange Goal</button>
                    <button onClick={() => this.setCameraView(2)}>Mid Field</button>
                    <button onClick={() => this.setCameraView(1)}>Blue Goal</button>
                </div>
            </div>
        )
    }

    public readonly start = () => {
        if (!this.hasStarted) {
            this.hasStarted = true
            this.helper.playAnimationClips()
            // Store the updater function as a callback
            this.props.clock.addCallback(this.animate)
        }
        // Render the field
        this.animate(0)
    }

    private readonly stop = () => {
        this.props.clock.pause()
    }

    /**
     * Called with a frame number from the FPSClock.
     */
    private readonly animate = (frame: number) => {
        if (this.stats) {
            this.stats.begin()
        }

        // Send delta to the helper for clip position updates
        const delta = this.props.clock.getDelta()
        this.helper.updateAnimationClips(delta)
        // Point the camera
        this.updateCamera(frame)
        // Paints the new scene
        this.renderScene()

        if (this.stats) {
            this.stats.end()
        }
    }

    private readonly renderScene = () => {
        this.renderer.render(this.threeField.scene, this.threeField.camera)
    }

    /**
     * Should be called whenever the canvas dimensions are changed (i.e. window resize).
     */
    private readonly updateSize = () => {
        const width = this.mount ? this.mount.clientWidth : 640
        const height = this.mount ? this.mount.clientHeight : 480
        this.threeField.camera.aspect = width / height
        this.threeField.camera.updateProjectionMatrix()
        this.renderer.setSize(width, height)
        this.renderScene()
    }

    private readonly generateScene = () => {
        const width = this.mount ? this.mount.clientWidth : 640
        const height = this.mount ? this.mount.clientHeight : 480

        // Add scene
        this.threeField.scene = new Scene()

        // Add camera
        this.threeField.camera = new PerspectiveCamera(80, width / height, 0.1, 20000)
        this.setCameraView(0)
        this.addToWindow(this.threeField.camera, "camera")
        this.threeField.camera.rotation.x -= (7 * Math.PI) / 180

        // Add renderer
        this.renderer.setClearColor("#000000")
        this.renderer.setSize(width, height)
        // If we can't render, this will throw an error
        this.mount!.appendChild(this.renderer.domElement)
    }

    private readonly generatePlayfield = async () => {
        const field = this.threeField

        // Add green ground. TODO: Replace with field model
        // const geometry = new PlaneBufferGeometry(8192, 10240, 1, 1)
        // const material = new MeshPhongMaterial({ color: "#4CAF50" })
        // field.ground = new Mesh(geometry, material)
        // field.ground.position.y = -1
        // field.ground.rotation.x = -Math.PI / 2
        // field.scene.add(field.ground)

        // Add goals. TODO: Replace with field model
        const goalPlane = new PlaneBufferGeometry(2000, 1284.5, 1, 1)
        const blueGoalMaterial = new MeshPhongMaterial({
            color: "#2196f3",
            side: DoubleSide,
            opacity: 0.3,
            transparent: true
        })
        const orangeGoalMaterial = new MeshPhongMaterial({
            color: "#ff9800",
            side: DoubleSide,
            opacity: 0.3,
            transparent: true
        })
        const blueGoal = new Mesh(goalPlane, blueGoalMaterial)
        blueGoal.position.z = -5120
        field.scene.add(blueGoal)
        const orangeGoal = new Mesh(goalPlane, orangeGoalMaterial)
        orangeGoal.position.z = 5120
        orangeGoal.rotation.y = Math.PI
        field.scene.add(orangeGoal)

        // Ambient light
        field.scene.add(new AmbientLight(0x444444))

        // Hemisphere light
        field.scene.add(new HemisphereLight(0xffffbb, 0x080820, 1))

        // TODO:
        const fieldModel = await ThreeModelLoader.Instance(this.loadingManager).getField()
        field.ground = fieldModel
        field.scene.add(fieldModel)
    }

    private readonly generateBall = async () => {
        const field = this.threeField
        const ball = await ThreeModelLoader.Instance(this.loadingManager).getBall()
        ball.name = BALL_NAME
        ball.scale.setScalar(90)
        // ball.add(new AxesHelper(5))
        this.helper.addBallMixer(ball)
        field.ball = ball
        field.scene.add(ball)
    }

    private readonly generatePlayers = async (players: string[]) => {
        const field = this.threeField
        field.players = []

        const octane = await ThreeModelLoader.Instance(this.loadingManager).getCar()
        this.addToWindow(octane, "car")
        octane.scale.setScalar(20) // TODO: This size is 20
        const chassis = (octane.children[0] as Mesh).material[1] as MeshPhongMaterial
        chassis.color.setHex(0x555555)

        for (let i = 0; i < players.length; i++) {
            const name = players[i]
            const orangeTeam = this.props.replayData.colors[i]
            const playerMesh = octane.clone(true)
            const player = new ThreePlayer(name, orangeTeam, playerMesh)

            // Debugging
            player.carObject.add(new AxesHelper(5))
            if (this.props.replayData.names[i] === "Sciguymjm") {
                this.addToWindow(player, "player")
            }

            field.scene.add(player.carObject)
            field.players.push(player)
            this.helper.addPlayerMixer(player.carObject)
        }
    }

    private readonly updateCamera = (frame: number) => {
        this.threeField.camera.lookAt(this.threeField.ball.position)
        if (this.activePlayer !== -1) {
            const isUsingBoost = this.props.replayData.players[this.activePlayer][frame][6]
            this.threeField.players[this.activePlayer].updateCamera(
                this.threeField.ball.position,
                isUsingBoost
            )
        }
    }

    private readonly deactivatePlayer = () => {
        if (this.activePlayer !== -1) {
            this.threeField.players[this.activePlayer].makeUnactive()
        }
    }

    private readonly setActivePlayer = () => {
        const { camera } = this.threeField
        this.deactivatePlayer()
        this.activePlayer = this.threeField.players.findIndex((player) => {
            return player.getName() === this.props.activeCamera
        })
        if (this.activePlayer !== -1) {
            this.threeField.players[this.activePlayer].makeActive(camera)
        } else {
            this.setCameraView(0)
        }
    }

    private readonly setCameraView = (viewId: number | string) => {
        const field = this.threeField
        this.deactivatePlayer()
        this.activePlayer = -1
        switch (viewId) {
            case 0:
                field.camera.position.z = 5750
                field.camera.position.y = 750
                break
            case 1:
                field.camera.position.z = -5750
                field.camera.position.y = 750
                break
            case 2:
                field.camera.position.z = 0
                field.camera.position.y = 750
                break
            default:
                throw new Error(`Unknown viewId: ${viewId}`)
        }
    }

    private readonly addToWindow = (object: any, name: string) => {
        const w = window as any
        w[name] = object
    }
}
