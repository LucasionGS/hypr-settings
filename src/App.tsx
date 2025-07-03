import "./App.scss";
import { HyprlandProvider } from "./services/Hyprland";
import DisplayManager from "./components/DisplayManager";

function App() {
  return (
    <HyprlandProvider>
      <main className="main-container">
        <DisplayManager />
      </main>
    </HyprlandProvider>
  );
}

export default App;

