import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TemaToggle() {
  const [escuro, setEscuro] = useState(true);
  useEffect(() => {
    setEscuro(document.documentElement.classList.contains("dark"));
  }, []);
  const alternar = () => {
    const novo = !escuro;
    setEscuro(novo);
    document.documentElement.classList.toggle("dark", novo);
    localStorage.setItem("tema", novo ? "escuro" : "claro");
  };
  return (
    <Button variant="ghost" size="icon" onClick={alternar} aria-label="Alternar tema" title={escuro ? "Tema claro" : "Tema escuro"}>
      {escuro ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
