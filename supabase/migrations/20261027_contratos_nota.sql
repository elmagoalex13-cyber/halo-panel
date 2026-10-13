-- Nota interna de cada contrato (la ven los dos para clasificarlos: «pendiente de DNI», «equipo de Alex», «ya empezó»...)
ALTER TABLE contratos_modelos ADD COLUMN IF NOT EXISTS nota_interna text;
